package retention

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/checksum"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
)

func installFakePgRestore(t *testing.T) {
	t.Helper()
	bin := t.TempDir()
	path := filepath.Join(bin, "pg_restore")
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func backupID(at time.Time, suffix string) string {
	return at.UTC().Format("20060102T150405Z") + "-" + suffix
}

func createValidBundle(t *testing.T, root, id string, created time.Time) string {
	t.Helper()
	path := filepath.Join(root, id)
	for _, dir := range []string{"database", "app", "instance"} {
		if err := os.MkdirAll(filepath.Join(path, dir), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	dumpPath := filepath.Join(path, "database", "database.dump")
	if err := os.WriteFile(dumpPath, []byte("fake custom-format dump"), 0o600); err != nil {
		t.Fatal(err)
	}
	globalsPath := filepath.Join(path, "database", "globals.sql")
	if err := os.WriteFile(globalsPath, []byte("-- globals\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	instancePath := filepath.Join(path, "instance", "installation.json")
	if err := os.WriteFile(instancePath, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	source := t.TempDir()
	if err := os.WriteFile(filepath.Join(source, "data.txt"), []byte("payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	appPath := filepath.Join(path, "app", "app-data.tar.zst")
	if err := archive.CreateZstd(source, appPath); err != nil {
		t.Fatal(err)
	}
	dumpInfo, _ := os.Stat(dumpPath)
	globalsInfo, _ := os.Stat(globalsPath)
	instanceInfo, _ := os.Stat(instancePath)
	appInfo, _ := os.Stat(appPath)

	m := manifest.Manifest{
		BackupFormatVersion: manifest.FormatVersion,
		BackupID:            id,
		RunID:               "run-" + id,
		CreatedAt:           created.UTC().Format(time.RFC3339Nano),
		CompletedAt:         created.UTC().Add(time.Minute).Format(time.RFC3339Nano),
		Tool:                manifest.Tool{Name: "sensorsphere-backup", Version: "0.1.0"},
		Source:              manifest.Source{Environment: "DEV", InstanceName: "test"},
		Stack: manifest.Stack{
			StackVersion:  "2026.10.03.1",
			SchemaVersion: 4,
			Components:    map[string]manifest.Component{},
		},
		Database: manifest.Database{Name: "sensorsphere", ServerMajor: 17},
		Payload:  map[string]manifest.PayloadItem{},
		Verification: manifest.Verification{
			Status:     "VERIFIED",
			VerifiedAt: created.UTC().Add(time.Minute).Format(time.RFC3339Nano),
		},
	}
	for _, name := range []string{"api", "frontend", "ingestion", "nginx", "migrations", "backup"} {
		m.Stack.Components[name] = manifest.Component{Version: "1", Image: "example/" + name + ":1"}
	}
	m.Payload["database"] = manifest.PayloadItem{Included: true, Required: true, Path: "database/database.dump", SizeBytes: dumpInfo.Size()}
	m.Payload["globals"] = manifest.PayloadItem{Included: true, Required: true, Path: "database/globals.sql", SizeBytes: globalsInfo.Size()}
	m.Payload["appData"] = manifest.PayloadItem{Included: true, Required: true, Path: "app/app-data.tar.zst", SizeBytes: appInfo.Size()}
	m.Payload["instanceMetadata"] = manifest.PayloadItem{Included: true, Required: true, Path: "instance/installation.json", SizeBytes: instanceInfo.Size()}

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
	return path
}

func countAction(decisions []Decision, action string) int {
	count := 0
	for _, decision := range decisions {
		if decision.Action == action {
			count++
		}
	}
	return count
}

func hasReason(decisions []Decision, reason string) bool {
	for _, decision := range decisions {
		if decision.Reason == reason {
			return true
		}
	}
	return false
}

func TestPlanRetentionBuckets(t *testing.T) {
	tests := []struct {
		name   string
		policy Policy
		dates  []time.Time
		reason string
	}{
		{
			name: "daily", policy: Policy{Daily: 2}, reason: "daily retention",
			dates: []time.Time{
				time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 1, 2, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 1, 3, 12, 0, 0, 0, time.UTC),
			},
		},
		{
			name: "weekly", policy: Policy{Weekly: 2}, reason: "weekly retention",
			dates: []time.Time{
				time.Date(2026, 1, 5, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 1, 12, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 1, 19, 12, 0, 0, 0, time.UTC),
			},
		},
		{
			name: "monthly", policy: Policy{Monthly: 2}, reason: "monthly retention",
			dates: []time.Time{
				time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 2, 15, 12, 0, 0, 0, time.UTC),
				time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC),
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			installFakePgRestore(t)
			root := t.TempDir()
			for i, at := range tc.dates {
				createValidBundle(t, root, backupID(at, strings.Repeat(string(rune('a'+i)), 8)), at)
			}
			decisions, err := Plan(root, tc.policy)
			if err != nil {
				t.Fatal(err)
			}
			if got := countAction(decisions, "KEEP"); got != 2 {
				t.Fatalf("expected 2 KEEP decisions, got %d: %#v", got, decisions)
			}
			if got := countAction(decisions, "DELETE"); got != 1 {
				t.Fatalf("expected 1 DELETE decision, got %d: %#v", got, decisions)
			}
			if !hasReason(decisions, tc.reason) {
				t.Fatalf("expected reason %q: %#v", tc.reason, decisions)
			}
		})
	}
}

func TestPlanAlwaysProtectsNewestVerified(t *testing.T) {
	installFakePgRestore(t)
	root := t.TempDir()
	for i := 0; i < 3; i++ {
		at := time.Date(2026, 4, 1+i, 12, 0, 0, 0, time.UTC)
		createValidBundle(t, root, backupID(at, strings.Repeat(string(rune('d'+i)), 8)), at)
	}
	decisions, err := Plan(root, Policy{})
	if err != nil {
		t.Fatal(err)
	}
	if countAction(decisions, "KEEP") != 1 {
		t.Fatalf("expected only newest backup kept: %#v", decisions)
	}
	if decisions[0].Action != "KEEP" || decisions[0].Reason != "newest verified" {
		t.Fatalf("newest backup not protected: %#v", decisions)
	}
}

func TestPlanProtectsOnlyValidBackupAndIgnoresCorrupt(t *testing.T) {
	installFakePgRestore(t)
	root := t.TempDir()
	at := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	validID := backupID(at, "aaaaaaaa")
	createValidBundle(t, root, validID, at)
	corruptID := backupID(at.Add(time.Hour), "bbbbbbbb")
	corruptPath := filepath.Join(root, corruptID)
	if err := os.MkdirAll(corruptPath, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(corruptPath, "COMPLETE"), []byte("broken"), 0o600); err != nil {
		t.Fatal(err)
	}

	decisions, err := Plan(root, Policy{})
	if err != nil {
		t.Fatal(err)
	}
	if countAction(decisions, "KEEP") != 1 || countAction(decisions, "DELETE") != 0 || countAction(decisions, "IGNORE") != 1 {
		t.Fatalf("unexpected single-valid protection plan: %#v", decisions)
	}
}

func TestApplyRejectsMismatchedPath(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "actual")
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	err := Apply([]Decision{{BackupID: "different", Path: path, Action: "DELETE"}})
	if err == nil {
		t.Fatal("expected unsafe retention path rejection")
	}
	if _, statErr := os.Stat(path); statErr != nil {
		t.Fatalf("path should not have been deleted: %v", statErr)
	}
}
