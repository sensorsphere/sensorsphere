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
