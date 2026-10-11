package restore

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
)

type DBRestoreResult struct {
	ServerVersion    string `json:"serverVersion"`
	ServerMajor      int    `json:"serverMajor"`
	TimescaleVersion string `json:"timescaleVersion"`
	MigrationLevel   int    `json:"migrationLevel"`
}

type commandRunner interface {
	Run(name string, args []string, env []string) (string, error)
}

type osCommandRunner struct{}

func (osCommandRunner) Run(name string, args []string, env []string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Env = env
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return strings.TrimSpace(stdout.String()), fmt.Errorf("%s failed: %w: %s", filepath.Base(name), err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

var databaseIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func RestoreDatabase(cfg config.Config, dumpPath string) (DBRestoreResult, error) {
	return restoreDatabaseWith(
		cfg,
		dumpPath,
		osCommandRunner{},
		database.VerifyDump,
		func(dbCfg database.Config) (database.Metadata, error) { return database.ReadMetadata(dbCfg) },
	)
}

func restoreDatabaseWith(
	cfg config.Config,
	dumpPath string,
	runner commandRunner,
	verifyDump func(string) error,
	readMetadata func(database.Config) (database.Metadata, error),
) (DBRestoreResult, error) {
	if cfg.DBPassword == "" {
		return DBRestoreResult{}, fmt.Errorf("database password is required")
	}
	if !databaseIdentifier.MatchString(cfg.DBName) {
		return DBRestoreResult{}, fmt.Errorf("unsafe target database name: %q", cfg.DBName)
	}
	if !databaseIdentifier.MatchString(cfg.DBUser) {
		return DBRestoreResult{}, fmt.Errorf("unsafe target database owner: %q", cfg.DBUser)
	}
	if filepath.Clean(dumpPath) == "." || dumpPath == "" {
		return DBRestoreResult{}, fmt.Errorf("database dump path is required")
	}
	if err := verifyDump(dumpPath); err != nil {
		return DBRestoreResult{}, fmt.Errorf("verify database dump immediately before restore: %w", err)
	}

	env := append(os.Environ(), "PGPASSWORD="+cfg.DBPassword)
	psql := func(dbName, sql string) error {
		args := []string{
			"-h", cfg.DBHost,
			"-p", strconv.Itoa(cfg.DBPort),
			"-U", cfg.DBUser,
			"-d", dbName,
			"-v", "ON_ERROR_STOP=1",
			"-c", sql,
		}
		if _, err := runner.Run("psql", args, env); err != nil {
			return err
		}
		return nil
	}

	dbLiteral := strings.ReplaceAll(cfg.DBName, "'", "''")
	dbIdent := quoteIdentifier(cfg.DBName)
	ownerIdent := quoteIdentifier(cfg.DBUser)

	if err := psql("postgres", fmt.Sprintf(
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%s' AND pid <> pg_backend_pid();",
		dbLiteral,
	)); err != nil {
		return DBRestoreResult{}, fmt.Errorf("terminate target database sessions: %w", err)
	}
	if err := psql("postgres", "DROP DATABASE IF EXISTS "+dbIdent+";"); err != nil {
		return DBRestoreResult{}, fmt.Errorf("drop target database: %w", err)
	}
	if err := psql("postgres", "CREATE DATABASE "+dbIdent+" OWNER "+ownerIdent+";"); err != nil {
		return DBRestoreResult{}, fmt.Errorf("create target database: %w", err)
	}
	if err := psql(cfg.DBName, "CREATE EXTENSION IF NOT EXISTS timescaledb;"); err != nil {
		return DBRestoreResult{}, fmt.Errorf("enable TimescaleDB extension: %w", err)
	}

	preRestoreEntered := false
	if err := psql(cfg.DBName, "SELECT timescaledb_pre_restore();"); err != nil {
		return DBRestoreResult{}, fmt.Errorf("enter TimescaleDB restore mode: %w", err)
	}
	preRestoreEntered = true

	pgRestoreArgs := []string{
		"-h", cfg.DBHost,
		"-p", strconv.Itoa(cfg.DBPort),
		"-U", cfg.DBUser,
		"-d", cfg.DBName,
		"--exit-on-error",
		"--no-owner",
		dumpPath,
	}
	if _, err := runner.Run("pg_restore", pgRestoreArgs, env); err != nil {
		if preRestoreEntered {
			if cleanupErr := psql(cfg.DBName, "SELECT timescaledb_post_restore();"); cleanupErr != nil {
				return DBRestoreResult{}, fmt.Errorf("pg_restore failed: %v; TimescaleDB post-restore cleanup also failed: %w", err, cleanupErr)
			}
		}
		return DBRestoreResult{}, fmt.Errorf("pg_restore failed: %w", err)
	}

	if preRestoreEntered {
		if err := psql(cfg.DBName, "SELECT timescaledb_post_restore();"); err != nil {
			return DBRestoreResult{}, fmt.Errorf("leave TimescaleDB restore mode: %w", err)
		}
	}
	if err := psql(cfg.DBName, "ANALYZE;"); err != nil {
		return DBRestoreResult{}, fmt.Errorf("analyze restored database: %w", err)
	}

	meta, err := readMetadata(database.Config{
		Host:     cfg.DBHost,
		Port:     cfg.DBPort,
		Name:     cfg.DBName,
		User:     cfg.DBUser,
		Password: cfg.DBPassword,
	})
	if err != nil {
		return DBRestoreResult{}, fmt.Errorf("read restored database metadata: %w", err)
	}
	return DBRestoreResult{
		ServerVersion:    meta.ServerVersion,
		ServerMajor:      meta.ServerMajor,
		TimescaleVersion: meta.TimescaleVersion,
		MigrationLevel:   meta.MigrationLevel,
	}, nil
}

func quoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}
