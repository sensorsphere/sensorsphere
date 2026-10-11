package restore

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
)

func writeGlobals(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "globals.sql")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestParseGlobalsRoles(t *testing.T) {
	path := writeGlobals(t, `--
SET client_encoding = 'UTF8';
CREATE ROLE iot_app;
ALTER ROLE iot_app WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;
`)
	roles, err := parseGlobalsRoles(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(roles) != 1 || roles[0].Name != "iot_app" {
		t.Fatalf("unexpected roles: %#v", roles)
	}
	if got := strings.Join(roles[0].Attributes, " "); got != "SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS" {
		t.Fatalf("unexpected attributes: %s", got)
	}
}

func TestParseGlobalsRejectsUnsupportedRoleAttribute(t *testing.T) {
	path := writeGlobals(t, "CREATE ROLE iot_app;\nALTER ROLE iot_app WITH SUPERUSER PASSWORD 'secret';\n")
	if _, err := parseGlobalsRoles(path); err == nil || !strings.Contains(err.Error(), "unsupported role attribute") {
		t.Fatalf("expected unsupported attribute error, got %v", err)
	}
}

type roleTestRunner struct {
	existing map[string]bool
	trace    []string
}

func (r *roleTestRunner) Run(name string, args []string, env []string) (string, error) {
	command := name + " " + strings.Join(args, " ")
	r.trace = append(r.trace, command)
	for role, exists := range r.existing {
		if strings.Contains(command, "rolname = '"+role+"'") && exists {
			return "1", nil
		}
	}
	return "", nil
}

func TestRestoreMissingRolesCreatesOnlyMissingRoles(t *testing.T) {
	runner := &roleTestRunner{existing: map[string]bool{"target_owner": true}}
	roles := []roleDefinition{
		{Name: "target_owner", Attributes: []string{"SUPERUSER", "LOGIN"}},
		{Name: "iot_app", Attributes: []string{"SUPERUSER", "LOGIN"}},
	}
	cfg := config.Config{DBHost: "timescaledb", DBPort: 5432, DBUser: "sensorsphere", DBPassword: "secret"}
	created, err := restoreMissingRolesWith(cfg, roles, runner)
	if err != nil {
		t.Fatal(err)
	}
	if len(created) != 1 || created[0] != "iot_app" {
		t.Fatalf("unexpected created roles: %#v", created)
	}
	trace := strings.Join(runner.trace, "\n")
	if strings.Contains(trace, "CREATE ROLE \"target_owner\"") {
		t.Fatalf("existing target role must not be altered: %s", trace)
	}
	if !strings.Contains(trace, "CREATE ROLE \"iot_app\"") ||
		!strings.Contains(trace, "ALTER ROLE \"iot_app\" WITH SUPERUSER LOGIN") {
		t.Fatalf("missing role creation trace: %s", trace)
	}
}
