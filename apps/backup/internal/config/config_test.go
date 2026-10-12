package config

import (
	"strings"
	"testing"
)

func TestLoadRejectsInvalidDBPort(t *testing.T) {
	for _, value := range []string{"0", "65536", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("DB_PORT", value)
			if _, err := Load(); err == nil || !strings.Contains(err.Error(), "DB_PORT") {
				t.Fatalf("expected DB_PORT error, got %v", err)
			}
		})
	}
}

func TestLoadRejectsInvalidRetentionValues(t *testing.T) {
	tests := map[string]string{
		"SENSORSPHERE_BACKUP_RETENTION_DAILY":   "-1",
		"SENSORSPHERE_BACKUP_RETENTION_WEEKLY":  "bad",
		"SENSORSPHERE_BACKUP_RETENTION_MONTHLY": "-2",
	}
	for key, value := range tests {
		t.Run(key, func(t *testing.T) {
			t.Setenv(key, value)
			if _, err := Load(); err == nil || !strings.Contains(err.Error(), key) {
				t.Fatalf("expected %s error, got %v", key, err)
			}
		})
	}
}

func TestLoadRejectsWarningAboveCritical(t *testing.T) {
	t.Setenv("SENSORSPHERE_BACKUP_WARNING_AGE_HOURS", "49")
	t.Setenv("SENSORSPHERE_BACKUP_CRITICAL_AGE_HOURS", "48")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "WARNING_AGE_HOURS") {
		t.Fatalf("expected threshold ordering error, got %v", err)
	}
}

func TestValidateForCreateRequiresPassword(t *testing.T) {
	cfg := Config{
		BackupRoot:   "/backups",
		StateRoot:    "/state",
		InstanceRoot: "/instance",
		AppRoot:      "/source/app",
	}
	if err := cfg.ValidateForCreate(); err == nil {
		t.Fatal("expected missing password error")
	}
}

func TestLoadResolvesRelativeDataRootAgainstInstallDir(t *testing.T) {
	t.Setenv("SENSORSPHERE_INSTALL_DIR", "/srv/sensorsphere-recovery")
	t.Setenv("SENSORSPHERE_DATA_ROOT", "./data")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DataRoot != "/srv/sensorsphere-recovery/data" {
		t.Fatalf("unexpected resolved DATA_ROOT: %q", cfg.DataRoot)
	}
}

func TestValidateForRestorePreflightRejectsIncompleteOrRelativeIdentity(t *testing.T) {
	base := Config{
		DBPassword:                "secret",
		BackupRoot:                "/backups",
		InstanceName:              "Recovery",
		Environment:               "RECOVERY",
		InstallDir:                "/srv/recovery",
		ComposeProject:            "recovery",
		DataRoot:                  "/srv/recovery/data",
		StackVersion:              "2026.10.11.1",
		DatabaseMinMigrationLevel: 72,
		DatabaseMaxMigrationLevel: 87,
	}
	tests := map[string]func(*Config){
		"missing data root":       func(c *Config) { c.DataRoot = "" },
		"relative data root":      func(c *Config) { c.DataRoot = "./data" },
		"relative install dir":    func(c *Config) { c.InstallDir = "./recovery" },
		"missing compose project": func(c *Config) { c.ComposeProject = "" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			cfg := base
			mutate(&cfg)
			if err := cfg.ValidateForRestorePreflight(); err == nil {
				t.Fatal("expected restore preflight identity rejection")
			}
		})
	}
}
