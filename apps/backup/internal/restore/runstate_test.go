package restore

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
)

func testPreflightForRun() PreflightResult {
	return PreflightResult{
		Mode:        ModeData,
		BackupID:    "backup-1",
		Source:      manifest.Source{InstanceName: "DEV", Environment: "DEV"},
		SourceStack: manifest.Stack{StackVersion: "2026.10.07.1"},
		Target: TargetIdentity{
			InstanceName: "Recovery",
			Environment:  "RECOVERY",
			InstallDir:   "/srv/recovery",
			StackVersion: "2026.10.07.1",
		},
	}
}

func TestRunTrackerLifecycle(t *testing.T) {
	root := filepath.Join(t.TempDir(), "restore-state")
	tracker, err := NewRunTracker(root, testPreflightForRun())
	if err != nil {
		t.Fatal(err)
	}
	if err := tracker.SetSafetyBackup("safety-1"); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Phase("DATABASE_RESTORE"); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Complete("2026.10.07.1", 87); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var got runstate.Run
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if got.Status != runstate.StatusSuccess || got.SafetyBackupID != "safety-1" || got.RestoredMigrationLevel != 87 {
		t.Fatalf("unexpected final run: %#v", got)
	}
}

func TestRunTrackerFailureRetainsSafetyBackup(t *testing.T) {
	root := filepath.Join(t.TempDir(), "restore-state")
	tracker, err := NewRunTracker(root, testPreflightForRun())
	if err != nil {
		t.Fatal(err)
	}
	if err := tracker.SetSafetyBackup("safety-2"); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Fail("DATABASE_RESTORE", 50, errors.New("restore failed")); err != nil {
		t.Fatal(err)
	}
	if tracker.Run.Status != runstate.StatusFailed || tracker.Run.SafetyBackupID != "safety-2" {
		t.Fatalf("unexpected failed run: %#v", tracker.Run)
	}
}

func TestAcquireMutationLockUsesRecoveryRoot(t *testing.T) {
	lockRoot := filepath.Join(t.TempDir(), "recovery-lock")
	cfg := config.Config{RecoveryLockRoot: lockRoot}
	first, err := AcquireMutationLock(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	if second, err := AcquireMutationLock(cfg); err == nil {
		second.Close()
		t.Fatal("expected shared recovery lock rejection")
	}
}

func TestInterruptCurrentRunMarksRunningRestoreInterrupted(t *testing.T) {
	root := filepath.Join(t.TempDir(), "restore-state")
	cfg := config.Config{StateRoot: root}
	run := runstate.Run{
		RunID:     "restore-running",
		Command:   "restore",
		Status:    runstate.StatusRunning,
		Phase:     "DATABASE_RESTORE",
		StartedAt: "2026-10-11T00:00:00Z",
	}
	if err := runstate.Write(root, run); err != nil {
		t.Fatal(err)
	}
	runID, changed, err := InterruptCurrentRun(cfg, "RESTORE_ENGINE", "engine disappeared")
	if err != nil {
		t.Fatal(err)
	}
	if runID != run.RunID || !changed {
		t.Fatalf("unexpected interrupt result runId=%q changed=%v", runID, changed)
	}
	data, err := os.ReadFile(filepath.Join(root, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var got runstate.Run
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if got.Status != runstate.StatusInterrupted || got.Phase != "INTERRUPTED" || got.FailedStep != "RESTORE_ENGINE" || got.ErrorCode != 80 {
		t.Fatalf("unexpected interrupted state: %#v", got)
	}
}

func TestInterruptCurrentRunLeavesTerminalStateUnchanged(t *testing.T) {
	root := filepath.Join(t.TempDir(), "restore-state")
	cfg := config.Config{StateRoot: root}
	run := runstate.Run{
		RunID:     "restore-failed",
		Command:   "restore",
		Status:    runstate.StatusFailed,
		Phase:     "FAILED",
		StartedAt: "2026-10-11T00:00:00Z",
	}
	if err := runstate.Write(root, run); err != nil {
		t.Fatal(err)
	}
	runID, changed, err := InterruptCurrentRun(cfg, "RESTORE_ENGINE", "ignored")
	if err != nil {
		t.Fatal(err)
	}
	if runID != run.RunID || changed {
		t.Fatalf("terminal state must remain unchanged runId=%q changed=%v", runID, changed)
	}
}
