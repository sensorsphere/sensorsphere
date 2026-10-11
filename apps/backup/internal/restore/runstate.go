package restore

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"time"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
)

type RunTracker struct {
	root string
	Run  runstate.Run
}

func NewRunTracker(stateRoot string, preflight PreflightResult) (*RunTracker, error) {
	runID, err := newRestoreRunID()
	if err != nil {
		return nil, fmt.Errorf("generate restore run id: %w", err)
	}
	osUser := ""
	if current, err := user.Current(); err == nil {
		osUser = current.Username
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tracker := &RunTracker{
		root: stateRoot,
		Run: runstate.Run{
			RunID:                    runID,
			Command:                  "restore",
			StartedAt:                now,
			Status:                   runstate.StatusStarting,
			Phase:                    "PREFLIGHT",
			Mode:                     string(preflight.Mode),
			SourceBackupID:           preflight.BackupID,
			SourceInstance:           preflight.Source.InstanceName,
			TargetInstance:           preflight.Target.InstanceName,
			TargetEnvironment:        preflight.Target.Environment,
			TargetInstallDir:         preflight.Target.InstallDir,
			SourceStackVersion:       preflight.SourceStack.StackVersion,
			TargetStackVersionBefore: preflight.Target.StackVersion,
			OperatingSystemUser:      osUser,
		},
	}
	if err := runstate.Write(stateRoot, tracker.Run); err != nil {
		return nil, err
	}
	return tracker, nil
}

func (t *RunTracker) SetSafetyBackup(backupID string) error {
	t.Run.SafetyBackupID = backupID
	t.Run.Phase = "SAFETY_BACKUP"
	t.Run.Status = runstate.StatusRunning
	return runstate.Write(t.root, t.Run)
}

func (t *RunTracker) Phase(phase string) error {
	t.Run.Phase = phase
	t.Run.Status = runstate.StatusRunning
	return runstate.Write(t.root, t.Run)
}

func (t *RunTracker) Fail(step string, code int, err error) error {
	t.Run.Status = runstate.StatusFailed
	t.Run.Phase = "FAILED"
	t.Run.FailedStep = step
	t.Run.ErrorCode = code
	if err != nil {
		t.Run.ErrorMessage = err.Error()
		t.Run.ErrorSummary = err.Error()
	}
	t.Run.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return runstate.Write(t.root, t.Run)
}

func (t *RunTracker) Interrupt(step string, err error) error {
	t.Run.Status = runstate.StatusInterrupted
	t.Run.Phase = "INTERRUPTED"
	t.Run.FailedStep = step
	t.Run.ErrorCode = 80
	if err != nil {
		t.Run.ErrorMessage = err.Error()
		t.Run.ErrorSummary = err.Error()
	}
	t.Run.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return runstate.Write(t.root, t.Run)
}

func LoadRunTracker(stateRoot, runID string) (*RunTracker, error) {
	if runID == "" {
		return nil, fmt.Errorf("restore run id is required")
	}
	data, err := os.ReadFile(filepath.Join(stateRoot, "runs", runID+".json"))
	if err != nil {
		return nil, fmt.Errorf("read restore run %s: %w", runID, err)
	}
	var run runstate.Run
	if err := json.Unmarshal(data, &run); err != nil {
		return nil, fmt.Errorf("parse restore run %s: %w", runID, err)
	}
	if run.Command != "restore" || run.RunID != runID {
		return nil, fmt.Errorf("invalid restore run record: %s", runID)
	}
	return &RunTracker{root: stateRoot, Run: run}, nil
}

func (t *RunTracker) EngineComplete(migrationLevel int) error {
	t.Run.Status = runstate.StatusRunning
	t.Run.Phase = "ENGINE_COMPLETE"
	t.Run.RestoredMigrationLevel = migrationLevel
	return runstate.Write(t.root, t.Run)
}

func (t *RunTracker) Complete(targetStack string, migrationLevel int) error {
	t.Run.Status = runstate.StatusSuccess
	t.Run.Phase = "COMPLETE"
	t.Run.TargetStackVersionAfter = targetStack
	t.Run.RestoredMigrationLevel = migrationLevel
	t.Run.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return runstate.Write(t.root, t.Run)
}

func AcquireMutationLock(cfg config.Config) (*runstate.Lock, error) {
	return runstate.Acquire(cfg.RecoveryLockRoot)
}

func newRestoreRunID() (string, error) {
	var random [4]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	return "restore-" + time.Now().UTC().Format("20060102T150405Z") + "-" + hex.EncodeToString(random[:]), nil
}
