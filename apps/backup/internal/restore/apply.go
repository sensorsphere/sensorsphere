package restore

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/verify"
)

type ApplyOptions struct {
	Confirmation    string
	SafetyBackupID  string
	WritersQuiesced bool
}

type ApplyResult struct {
	RunID                  string `json:"runId"`
	Status                 string `json:"status"`
	Phase                  string `json:"phase"`
	SourceBackupID         string `json:"sourceBackupId"`
	SafetyBackupID         string `json:"safetyBackupId"`
	RestoredMigrationLevel int    `json:"restoredMigrationLevel"`
}

func Apply(cfg config.Config, mode Mode, backupID string, opts ApplyOptions) (result ApplyResult, retErr error) {
	if mode != ModeData {
		return ApplyResult{}, &Error{Code: 2, Err: fmt.Errorf("full restore execution is not implemented in Restore V2 0.2.0")}
	}
	preflight, err := Preflight(cfg, mode, backupID)
	if err != nil {
		return ApplyResult{}, err
	}
	if !opts.WritersQuiesced {
		return ApplyResult{}, &Error{Code: 40, Err: fmt.Errorf("restore apply requires explicit writers-quiesced confirmation")}
	}
	if opts.Confirmation == "" || opts.Confirmation != preflight.Confirmation {
		return ApplyResult{}, &Error{Code: 40, Err: fmt.Errorf("restore confirmation phrase does not match expected target/source identity")}
	}
	if err := verifySafetyBackup(cfg, opts.SafetyBackupID, backupID); err != nil {
		return ApplyResult{}, &Error{Code: 30, Err: err}
	}

	tracker, err := NewRunTracker(cfg.StateRoot, preflight)
	if err != nil {
		return ApplyResult{}, &Error{Code: 80, Err: fmt.Errorf("initialize restore run state: %w", err)}
	}
	if err := tracker.SetSafetyBackup(opts.SafetyBackupID); err != nil {
		return ApplyResult{}, &Error{Code: 80, Err: fmt.Errorf("record safety backup: %w", err)}
	}

	fail := func(step string, code int, cause error) (ApplyResult, error) {
		_ = tracker.Fail(step, code, cause)
		return ApplyResult{}, &Error{Code: code, Err: cause}
	}

	lock, err := AcquireMutationLock(cfg)
	if err != nil {
		return fail("RECOVERY_LOCK", 40, err)
	}
	defer lock.Close()

	// Verify the exact source bundle again after the mutation lock is held and
	// immediately before any destructive operation.
	sourcePath, err := repository.Resolve(cfg.BackupRoot, backupID)
	if err != nil {
		return fail("BUNDLE_REVERIFY", 20, err)
	}
	sourceVerified, err := verify.Bundle(sourcePath, true)
	if err != nil {
		return fail("BUNDLE_REVERIFY", 20, fmt.Errorf("Recovery Bundle re-verification failed: %w", err))
	}
	if sourceVerified.Manifest.BackupID != preflight.BackupID {
		return fail("BUNDLE_REVERIFY", 20, fmt.Errorf("source backup identity changed during restore preparation"))
	}

	if err := tracker.Phase("DATABASE_PREPARE"); err != nil {
		return fail("DATABASE_PREPARE", 80, err)
	}
	dbItem, ok := sourceVerified.Manifest.Payload["database"]
	if !ok || !dbItem.Included || dbItem.Path == "" {
		return fail("DATABASE_PREPARE", 20, fmt.Errorf("Recovery Bundle database payload is missing"))
	}
	globalsItem, ok := sourceVerified.Manifest.Payload["globals"]
	if !ok || !globalsItem.Included || globalsItem.Path == "" {
		return fail("DATABASE_PREPARE", 20, fmt.Errorf("Recovery Bundle globals payload is missing"))
	}
	dumpPath := filepath.Join(sourcePath, filepath.FromSlash(dbItem.Path))
	globalsPath := filepath.Join(sourcePath, filepath.FromSlash(globalsItem.Path))

	if err := tracker.Phase("DATABASE_GLOBALS"); err != nil {
		return fail("DATABASE_GLOBALS", 80, err)
	}
	if _, err := RestoreMissingRoles(cfg, globalsPath); err != nil {
		return fail("DATABASE_GLOBALS", 50, err)
	}

	if err := tracker.Phase("DATABASE_RESTORE"); err != nil {
		return fail("DATABASE_RESTORE", 80, err)
	}
	dbResult, err := RestoreDatabase(cfg, dumpPath)
	if err != nil {
		return fail("DATABASE_RESTORE", 50, err)
	}

	if err := tracker.Phase("APP_DATA_RESTORE"); err != nil {
		return fail("APP_DATA_RESTORE", 80, err)
	}
	if err := RestoreApplicationData(cfg, sourcePath, sourceVerified.Manifest); err != nil {
		return fail("APP_DATA_RESTORE", 60, err)
	}

	if err := tracker.Phase("MOSQUITTO_RESTORE"); err != nil {
		return fail("MOSQUITTO_RESTORE", 80, err)
	}
	if _, err := RestoreMosquittoData(cfg, sourcePath, sourceVerified.Manifest); err != nil {
		return fail("MOSQUITTO_RESTORE", 60, err)
	}

	if err := tracker.EngineComplete(dbResult.MigrationLevel); err != nil {
		return fail("ENGINE_COMPLETE", 80, err)
	}

	result = ApplyResult{
		RunID:                  tracker.Run.RunID,
		Status:                 "RUNNING",
		Phase:                  "ENGINE_COMPLETE",
		SourceBackupID:         backupID,
		SafetyBackupID:         opts.SafetyBackupID,
		RestoredMigrationLevel: dbResult.MigrationLevel,
	}
	return result, nil
}

func verifySafetyBackup(cfg config.Config, safetyBackupID, sourceBackupID string) error {
	if strings.TrimSpace(safetyBackupID) == "" || safetyBackupID == "latest" {
		return fmt.Errorf("explicit safety backup id is required")
	}
	if safetyBackupID == sourceBackupID {
		return fmt.Errorf("safety backup must be distinct from source backup")
	}
	path, err := repository.Resolve(cfg.BackupRoot, safetyBackupID)
	if err != nil {
		return fmt.Errorf("resolve safety backup: %w", err)
	}
	result, err := verify.Bundle(path, true)
	if err != nil {
		return fmt.Errorf("verify safety backup: %w", err)
	}
	if !strings.EqualFold(result.Manifest.Verification.Status, "VERIFIED") {
		return fmt.Errorf("safety backup is not marked VERIFIED")
	}
	expectedLabel := "pre-restore safety backup for " + sourceBackupID
	if result.Manifest.Label != expectedLabel {
		return fmt.Errorf("safety backup label mismatch: expected %q", expectedLabel)
	}
	return nil
}

func FinalizeRun(cfg config.Config, runID string) error {
	tracker, err := LoadRunTracker(cfg.StateRoot, runID)
	if err != nil {
		return err
	}
	if tracker.Run.Status != "RUNNING" || tracker.Run.Phase != "ENGINE_COMPLETE" {
		return fmt.Errorf("restore run %s is not ready for finalization (status=%s phase=%s)", runID, tracker.Run.Status, tracker.Run.Phase)
	}
	if cfg.StackVersion == "" {
		return fmt.Errorf("target Stack version is unavailable")
	}
	meta, err := database.ReadMetadata(database.Config{
		Host: cfg.DBHost, Port: cfg.DBPort, Name: cfg.DBName, User: cfg.DBUser, Password: cfg.DBPassword,
	})
	if err != nil {
		return fmt.Errorf("read final restored database metadata: %w", err)
	}
	if meta.MigrationLevel < cfg.DatabaseMinMigrationLevel || meta.MigrationLevel > cfg.DatabaseMaxMigrationLevel {
		return fmt.Errorf(
			"final migration level %d is outside target compatibility range %d..%d",
			meta.MigrationLevel, cfg.DatabaseMinMigrationLevel, cfg.DatabaseMaxMigrationLevel,
		)
	}
	return tracker.Complete(cfg.StackVersion, meta.MigrationLevel)
}

func FailRun(cfg config.Config, runID, step string, code int, summary string) error {
	tracker, err := LoadRunTracker(cfg.StateRoot, runID)
	if err != nil {
		return err
	}
	if tracker.Run.Status == "SUCCESS" {
		return fmt.Errorf("restore run %s is already successful", runID)
	}
	if step == "" {
		step = "HOST_ORCHESTRATION"
	}
	if code <= 0 {
		code = 70
	}
	return tracker.Fail(step, code, fmt.Errorf("%s", summary))
}
