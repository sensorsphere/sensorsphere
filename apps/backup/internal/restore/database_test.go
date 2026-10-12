package restore

import (
	"errors"
	"strings"
	"testing"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
)

type recordedCommand struct {
	name string
	args []string
}

type fakeRunner struct {
	commands     []recordedCommand
	failName     string
	failContains string
}

func (f *fakeRunner) Run(name string, args []string, env []string) (string, error) {
	f.commands = append(f.commands, recordedCommand{name: name, args: append([]string(nil), args...)})
	if name == f.failName && (f.failContains == "" || strings.Contains(strings.Join(args, " "), f.failContains)) {
		return "", errors.New("injected failure")
	}
	return "", nil
}

func validRestoreConfig() config.Config {
	return config.Config{
		DBHost:     "timescaledb",
		DBPort:     5432,
		DBName:     "sensorsphere",
		DBUser:     "sensorsphere",
		DBPassword: "secret",
	}
}

func TestRestoreDatabaseSequence(t *testing.T) {
	runner := &fakeRunner{}
	result, err := restoreDatabaseWith(
		validRestoreConfig(),
		"/backups/id/database/database.dump",
		runner,
		func(string) error { return nil },
		func(database.Config) (database.Metadata, error) {
			return database.Metadata{ServerVersion: "17.6", ServerMajor: 17, TimescaleVersion: "2.21.3", MigrationLevel: 87}, nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.MigrationLevel != 87 {
		t.Fatalf("unexpected result: %#v", result)
	}
	joined := make([]string, 0, len(runner.commands))
	for _, command := range runner.commands {
		joined = append(joined, command.name+" "+strings.Join(command.args, " "))
	}
	trace := strings.Join(joined, "\n")
	for _, expected := range []string{
		"pg_terminate_backend",
		"DROP DATABASE IF EXISTS",
		"CREATE DATABASE",
		"timescaledb_pre_restore",
		"pg_restore",
		"timescaledb_post_restore",
		"ANALYZE",
	} {
		if !strings.Contains(trace, expected) {
			t.Fatalf("missing %q in trace:\n%s", expected, trace)
		}
	}
	for _, command := range runner.commands {
		if command.name == "pg_restore" && strings.Contains(strings.Join(command.args, " "), "-j") {
			t.Fatal("parallel pg_restore must not be used")
		}
	}
}

func TestRestoreDatabaseFailureAttemptsPostRestore(t *testing.T) {
	runner := &fakeRunner{failName: "pg_restore"}
	_, err := restoreDatabaseWith(
		validRestoreConfig(),
		"/backups/id/database/database.dump",
		runner,
		func(string) error { return nil },
		func(database.Config) (database.Metadata, error) { return database.Metadata{}, nil },
	)
	if err == nil {
		t.Fatal("expected pg_restore failure")
	}
	trace := ""
	for _, command := range runner.commands {
		trace += command.name + " " + strings.Join(command.args, " ") + "\n"
	}
	if !strings.Contains(trace, "timescaledb_post_restore") {
		t.Fatalf("expected post_restore cleanup after failure:\n%s", trace)
	}
}

func TestRestoreDatabaseRejectsUnsafeIdentityBeforeCommands(t *testing.T) {
	cfg := validRestoreConfig()
	cfg.DBName = "sensorsphere;DROP_DATABASE"
	runner := &fakeRunner{}
	_, err := restoreDatabaseWith(
		cfg,
		"/backups/id/database/database.dump",
		runner,
		func(string) error { return nil },
		func(database.Config) (database.Metadata, error) { return database.Metadata{}, nil },
	)
	if err == nil {
		t.Fatal("expected unsafe database identity rejection")
	}
	if len(runner.commands) != 0 {
		t.Fatalf("expected no commands, got %#v", runner.commands)
	}
}

func TestRestoreDatabaseTargetsOnlyConfiguredDatabase(t *testing.T) {
	cfg := validRestoreConfig()
	cfg.DBName = "targetdb"
	runner := &fakeRunner{}
	_, err := restoreDatabaseWith(
		cfg,
		"/backups/id/database/database.dump",
		runner,
		func(string) error { return nil },
		func(database.Config) (database.Metadata, error) {
			return database.Metadata{ServerVersion: "17.6", ServerMajor: 17, TimescaleVersion: "2.21.3", MigrationLevel: 87}, nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	trace := ""
	for _, command := range runner.commands {
		trace += command.name + " " + strings.Join(command.args, " ") + "\n"
	}
	for _, expected := range []string{
		"datname = 'targetdb'",
		`DROP DATABASE IF EXISTS "targetdb"`,
		`CREATE DATABASE "targetdb"`,
		"pg_restore -h timescaledb -p 5432 -U sensorsphere -d targetdb",
	} {
		if !strings.Contains(trace, expected) {
			t.Fatalf("missing target database constraint %q in trace:\n%s", expected, trace)
		}
	}
}
