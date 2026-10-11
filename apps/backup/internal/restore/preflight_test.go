package restore

import (
	"path/filepath"
	"testing"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
)

func TestErrorCode(t *testing.T) {
	err := &Error{Code: 20, Err: errText("bad bundle")}
	if got := ErrorCode(err); got != 20 {
		t.Fatalf("expected 20, got %d", got)
	}
}

type errText string

func (e errText) Error() string { return string(e) }

func TestModes(t *testing.T) {
	if ModeData != "data" || ModeFull != "full" {
		t.Fatalf("unexpected restore mode constants")
	}
}

func TestDegradedRetryRunAllowsMatchingFailedOrInterruptedRun(t *testing.T) {
	for _, status := range []runstate.Status{runstate.StatusFailed, runstate.StatusInterrupted} {
		t.Run(string(status), func(t *testing.T) {
			root := filepath.Join(t.TempDir(), "restore-state")
			cfg := config.Config{
				StateRoot:   root,
				Environment: "RECOVERY",
				InstallDir:  "/srv/recovery",
			}
			run := runstate.Run{
				RunID:             "restore-1",
				Command:           "restore",
				Status:            status,
				SourceBackupID:    "backup-1",
				TargetEnvironment: "RECOVERY",
				TargetInstallDir:  "/srv/recovery",
				SafetyBackupID:    "safety-1",
			}
			if err := runstate.Write(root, run); err != nil {
				t.Fatal(err)
			}
			got, err := degradedRetryRun(cfg, "backup-1")
			if err != nil {
				t.Fatal(err)
			}
			if got == nil || got.SafetyBackupID != "safety-1" {
				t.Fatalf("unexpected retry run: %#v", got)
			}
		})
	}
}

func TestDegradedRetryRunRejectsUnsafeMismatch(t *testing.T) {
	root := filepath.Join(t.TempDir(), "restore-state")
	cfg := config.Config{
		StateRoot:   root,
		Environment: "RECOVERY",
		InstallDir:  "/srv/recovery",
	}
	run := runstate.Run{
		RunID:             "restore-1",
		Command:           "restore",
		Status:            runstate.StatusFailed,
		SourceBackupID:    "backup-1",
		TargetEnvironment: "RECOVERY",
		TargetInstallDir:  "/srv/recovery",
		SafetyBackupID:    "safety-1",
	}
	if err := runstate.Write(root, run); err != nil {
		t.Fatal(err)
	}
	if _, err := degradedRetryRun(cfg, "backup-2"); err == nil {
		t.Fatal("expected source backup mismatch rejection")
	}

	run.SourceBackupID = "backup-1"
	run.TargetInstallDir = "/srv/other"
	if err := runstate.Write(root, run); err != nil {
		t.Fatal(err)
	}
	if _, err := degradedRetryRun(cfg, "backup-1"); err == nil {
		t.Fatal("expected target install mismatch rejection")
	}
}

func TestDegradedRetryRunDoesNotUseSuccessfulRun(t *testing.T) {
	root := filepath.Join(t.TempDir(), "restore-state")
	cfg := config.Config{
		StateRoot:   root,
		Environment: "RECOVERY",
		InstallDir:  "/srv/recovery",
	}
	run := runstate.Run{
		RunID:             "restore-1",
		Command:           "restore",
		Status:            runstate.StatusSuccess,
		SourceBackupID:    "backup-1",
		TargetEnvironment: "RECOVERY",
		TargetInstallDir:  "/srv/recovery",
		SafetyBackupID:    "safety-1",
	}
	if err := runstate.Write(root, run); err != nil {
		t.Fatal(err)
	}
	got, err := degradedRetryRun(cfg, "backup-1")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("successful run must not enable degraded retry: %#v", got)
	}
}
