package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/checksum"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
)

func installFakePgRestoreCLI(t *testing.T) {
	t.Helper()
	bin := t.TempDir()
	path := filepath.Join(bin, "pg_restore")
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func createStatusBundle(t *testing.T, root string, at time.Time) string {
	t.Helper()
	id := at.UTC().Format("20060102T150405Z") + "-aaaaaaaa"
	path := filepath.Join(root, id)
	for _, dir := range []string{"database", "app", "instance"} {
		if err := os.MkdirAll(filepath.Join(path, dir), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	dump := filepath.Join(path, "database", "database.dump")
	globals := filepath.Join(path, "database", "globals.sql")
	instance := filepath.Join(path, "instance", "installation.json")
	if err := os.WriteFile(dump, []byte("fake dump"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(globals, []byte("-- globals\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(instance, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	src := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "data.txt"), []byte("data"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := filepath.Join(path, "app", "app-data.tar.zst")
	if err := archive.CreateZstd(src, app); err != nil {
		t.Fatal(err)
	}

	stat := func(p string) int64 {
		info, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		return info.Size()
	}
	m := manifest.Manifest{
		BackupFormatVersion: manifest.FormatVersion,
		BackupID:            id,
		RunID:               "run-" + id,
		CreatedAt:           at.UTC().Format(time.RFC3339Nano),
		CompletedAt:         at.UTC().Add(time.Minute).Format(time.RFC3339Nano),
		Tool:                manifest.Tool{Name: "sensorsphere-backup", Version: "0.1.0"},
		Source:              manifest.Source{Environment: "DEV", InstanceName: "test"},
		Stack:               manifest.Stack{StackVersion: "2026.10.03.1", SchemaVersion: 4, Components: map[string]manifest.Component{}},
		Database:            manifest.Database{Name: "sensorsphere", ServerMajor: 17},
		Payload:             map[string]manifest.PayloadItem{},
		Verification:        manifest.Verification{Status: "VERIFIED", VerifiedAt: at.UTC().Format(time.RFC3339Nano)},
	}
	for _, name := range []string{"api", "frontend", "ingestion", "nginx", "migrations", "backup"} {
		m.Stack.Components[name] = manifest.Component{Version: "1", Image: "example/" + name + ":1"}
	}
	m.Payload["database"] = manifest.PayloadItem{Included: true, Required: true, Path: "database/database.dump", SizeBytes: stat(dump)}
	m.Payload["globals"] = manifest.PayloadItem{Included: true, Required: true, Path: "database/globals.sql", SizeBytes: stat(globals)}
	m.Payload["appData"] = manifest.PayloadItem{Included: true, Required: true, Path: "app/app-data.tar.zst", SizeBytes: stat(app)}
	m.Payload["instanceMetadata"] = manifest.PayloadItem{Included: true, Required: true, Path: "instance/installation.json", SizeBytes: stat(instance)}
	if err := manifest.Write(filepath.Join(path, "manifest.json"), m); err != nil {
		t.Fatal(err)
	}
	if err := checksum.Generate(path); err != nil {
		t.Fatal(err)
	}
	complete := "backupId=" + id + "\ncompletedAt=" + m.CompletedAt + "\nformatVersion=1\n"
	if err := os.WriteFile(filepath.Join(path, "COMPLETE"), []byte(complete), 0o600); err != nil {
		t.Fatal(err)
	}
	return id
}

func statusJSON(t *testing.T, backupRoot, stateRoot string, warning, critical int) statusOutput {
	t.Helper()
	t.Setenv("BACKUP_ROOT", backupRoot)
	t.Setenv("BACKUP_STATE_ROOT", stateRoot)
	t.Setenv("SENSORSPHERE_BACKUP_WARNING_AGE_HOURS", strconv.Itoa(warning))
	t.Setenv("SENSORSPHERE_BACKUP_CRITICAL_AGE_HOURS", strconv.Itoa(critical))
	var stdout, stderr bytes.Buffer
	code := runStatus([]string{"--json"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("status code=%d stderr=%s", code, stderr.String())
	}
	var out statusOutput
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestStatusNeverWithoutValidBackup(t *testing.T) {
	installFakePgRestoreCLI(t)
	out := statusJSON(t, t.TempDir(), t.TempDir(), 26, 48)
	if out.Status != "NEVER" {
		t.Fatalf("expected NEVER, got %s", out.Status)
	}
	if out.LastVerifiedBackupID != "" {
		t.Fatalf("unexpected last verified backup: %s", out.LastVerifiedBackupID)
	}
}

func TestStatusOKWarningCritical(t *testing.T) {
	installFakePgRestoreCLI(t)
	tests := []struct {
		name     string
		age      time.Duration
		expected string
	}{
		{name: "ok", age: 30 * time.Minute, expected: "OK"},
		{name: "warning", age: 2 * time.Hour, expected: "WARNING"},
		{name: "critical", age: 4 * time.Hour, expected: "CRITICAL"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			state := t.TempDir()
			id := createStatusBundle(t, root, time.Now().UTC().Add(-tc.age))
			out := statusJSON(t, root, state, 1, 3)
			if out.Status != tc.expected {
				t.Fatalf("expected %s, got %s (age=%d)", tc.expected, out.Status, out.AgeSeconds)
			}
			if out.LastVerifiedBackupID != id {
				t.Fatalf("expected backup %s, got %s", id, out.LastVerifiedBackupID)
			}
		})
	}
}

func TestStatusShowsFailedLatestRunSeparatelyFromFreshVerifiedBackup(t *testing.T) {
	installFakePgRestoreCLI(t)
	root := t.TempDir()
	state := t.TempDir()
	id := createStatusBundle(t, root, time.Now().UTC().Add(-30*time.Minute))
	if err := runstate.Write(state, runstate.Run{
		RunID:       "run-failed",
		Command:     "create",
		StartedAt:   time.Now().UTC().Add(-5 * time.Minute).Format(time.RFC3339Nano),
		CompletedAt: time.Now().UTC().Add(-4 * time.Minute).Format(time.RFC3339Nano),
		Status:      runstate.StatusFailed,
		Phase:       "DATABASE_DUMP",
		ErrorCode:   50,
	}); err != nil {
		t.Fatal(err)
	}

	out := statusJSON(t, root, state, 26, 48)
	if out.Status != "OK" {
		t.Fatalf("expected fresh verified backup to remain OK, got %s", out.Status)
	}
	if out.LastVerifiedBackupID != id {
		t.Fatalf("expected verified backup %s, got %s", id, out.LastVerifiedBackupID)
	}
	if out.LastRun == nil || out.LastRun.Status != runstate.StatusFailed {
		t.Fatalf("expected latest failed run to remain visible, got %#v", out.LastRun)
	}
}

func TestStatusIgnoresNewestCorruptBackup(t *testing.T) {
	installFakePgRestoreCLI(t)
	root := t.TempDir()
	state := t.TempDir()
	older := createStatusBundle(t, root, time.Now().UTC().Add(-30*time.Minute))
	newer := createStatusBundle(t, root, time.Now().UTC().Add(-10*time.Minute))

	path := filepath.Join(root, newer, "app", "app-data.tar.zst")
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString("corrupt"); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	out := statusJSON(t, root, state, 26, 48)
	if out.Status != "OK" {
		t.Fatalf("expected older verified backup to keep status OK, got %s", out.Status)
	}
	if out.LastVerifiedBackupID != older {
		t.Fatalf("expected corrupt newest backup %s to be ignored in favor of %s, got %s", newer, older, out.LastVerifiedBackupID)
	}
}
