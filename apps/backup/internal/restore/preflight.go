package restore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/compatibility"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/verify"
)

type Mode string

const (
	ModeData Mode = "data"
	ModeFull Mode = "full"
)

type TargetIdentity struct {
	InstanceName              string `json:"instanceName"`
	Environment               string `json:"environment"`
	Host                      string `json:"host,omitempty"`
	InstallDir                string `json:"installDir"`
	ComposeProject            string `json:"composeProject"`
	DataRoot                  string `json:"dataRoot"`
	StackVersion              string `json:"stackVersion"`
	PostgresMajor             int    `json:"postgresMajor"`
	PostgresVersion           string `json:"postgresVersion"`
	TimescaleVersion          string `json:"timescaleVersion,omitempty"`
	MigrationLevel            int    `json:"migrationLevel"`
	MigrationLevelKnown       bool   `json:"migrationLevelKnown"`
	DatabaseState             string `json:"databaseState"`
	DatabaseMinMigrationLevel int    `json:"databaseMinMigrationLevel"`
	DatabaseMaxMigrationLevel int    `json:"databaseMaxMigrationLevel"`
}

type PreflightResult struct {
	Status              string                 `json:"status"`
	Mode                Mode                   `json:"mode"`
	BackupID            string                 `json:"backupId"`
	BundlePath          string                 `json:"bundlePath"`
	Source              manifest.Source        `json:"source"`
	SourceStack         manifest.Stack         `json:"sourceStack"`
	SourceDB            manifest.Database      `json:"sourceDatabase"`
	Target              TargetIdentity         `json:"target"`
	Compatibility       compatibility.Decision `json:"compatibility"`
	Confirmation        string                 `json:"confirmation"`
	MutatesTarget       bool                   `json:"mutatesTarget"`
	DegradedRetry       bool                   `json:"degradedRetry"`
	RetrySafetyBackupID string                 `json:"retrySafetyBackupId,omitempty"`
}

type Error struct {
	Code int
	Err  error
}

func (e *Error) Error() string { return e.Err.Error() }
func (e *Error) Unwrap() error { return e.Err }

func Preflight(cfg config.Config, mode Mode, backupID string) (PreflightResult, error) {
	if mode != ModeData && mode != ModeFull {
		return PreflightResult{}, &Error{Code: 2, Err: fmt.Errorf("invalid restore mode: %s", mode)}
	}
	if strings.TrimSpace(backupID) == "" || backupID == "latest" {
		return PreflightResult{}, &Error{Code: 2, Err: fmt.Errorf("restore requires an explicit backup id")}
	}
	if err := cfg.ValidateForRestorePreflight(); err != nil {
		return PreflightResult{}, &Error{Code: 10, Err: err}
	}
	if !strings.EqualFold(cfg.Environment, "RECOVERY") {
		return PreflightResult{}, &Error{Code: 10, Err: fmt.Errorf(
			"initial Restore V2 is restricted to SENSORSPHERE_ENVIRONMENT=RECOVERY; target is %s",
			cfg.Environment,
		)}
	}

	path, err := repository.Resolve(cfg.BackupRoot, backupID)
	if err != nil {
		return PreflightResult{}, &Error{Code: 20, Err: err}
	}
	verified, err := verify.Bundle(path, true)
	if err != nil {
		return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf("Recovery Bundle verification failed: %w", err)}
	}
	if !strings.EqualFold(verified.Manifest.Verification.Status, "VERIFIED") {
		return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf("Recovery Bundle is not marked VERIFIED")}
	}
	appItem := verified.Manifest.Payload["appData"]
	if err := archive.VerifyRestoreSafeZstd(filepath.Join(path, filepath.FromSlash(appItem.Path))); err != nil {
		return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf("app archive is unsafe for restore: %w", err)}
	}
	if mqttItem, ok := verified.Manifest.Payload["mosquitto"]; ok && mqttItem.Included {
		if err := archive.VerifyRestoreSafeZstd(filepath.Join(path, filepath.FromSlash(mqttItem.Path))); err != nil {
			return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf("Mosquitto archive is unsafe for restore: %w", err)}
		}
	}
	globalsItem, ok := verified.Manifest.Payload["globals"]
	if !ok || !globalsItem.Included || globalsItem.Path == "" {
		return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf("Recovery Bundle globals payload is missing")}
	}
	if err := ValidateGlobalsRoles(filepath.Join(path, filepath.FromSlash(globalsItem.Path))); err != nil {
		return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf("globals dump is not safe/supported for restore: %w", err)}
	}

	targetDBCfg := database.Config{
		Host: cfg.DBHost, Port: cfg.DBPort, Name: cfg.DBName, User: cfg.DBUser, Password: cfg.DBPassword,
	}
	dbMeta, dbMetaErr := database.ReadMetadata(targetDBCfg)

	target := TargetIdentity{
		InstanceName:              cfg.InstanceName,
		Environment:               cfg.Environment,
		Host:                      cfg.InstallHost,
		InstallDir:                filepath.Clean(cfg.InstallDir),
		ComposeProject:            cfg.ComposeProject,
		DataRoot:                  cfg.DataRoot,
		StackVersion:              cfg.StackVersion,
		DatabaseMinMigrationLevel: cfg.DatabaseMinMigrationLevel,
		DatabaseMaxMigrationLevel: cfg.DatabaseMaxMigrationLevel,
	}

	retryRun, err := degradedRetryRun(cfg, backupID)
	if err != nil {
		return PreflightResult{}, &Error{Code: 10, Err: fmt.Errorf("target retry state is invalid: %w", err)}
	}
	if retryRun != nil {
		if err := verifySafetyBackup(cfg, retryRun.SafetyBackupID, backupID); err != nil {
			return PreflightResult{}, &Error{Code: 30, Err: fmt.Errorf("previous restore safety backup is not usable for retry: %w", err)}
		}
	}

	if dbMetaErr == nil {
		target.PostgresMajor = dbMeta.ServerMajor
		target.PostgresVersion = dbMeta.ServerVersion
		target.TimescaleVersion = dbMeta.TimescaleVersion
		target.MigrationLevel = dbMeta.MigrationLevel
		target.MigrationLevelKnown = true
		target.DatabaseState = "READY"
		if retryRun != nil {
			target.DatabaseState = "DEGRADED_RETRY"
		}
	} else {
		if retryRun == nil {
			return PreflightResult{}, &Error{Code: 10, Err: fmt.Errorf("read target database metadata: %w", dbMetaErr)}
		}
		clusterMeta, clusterErr := database.ReadClusterMetadata(targetDBCfg)
		if clusterErr != nil {
			return PreflightResult{}, &Error{Code: 10, Err: fmt.Errorf("read degraded target cluster metadata: %w", clusterErr)}
		}
		target.PostgresMajor = clusterMeta.ServerMajor
		target.PostgresVersion = clusterMeta.ServerVersion
		target.TimescaleVersion = clusterMeta.TimescaleVersion
		target.MigrationLevel = 0
		target.MigrationLevelKnown = false
		target.DatabaseState = "DEGRADED_RETRY"
	}

	if verified.Manifest.Source.InstallDir != "" &&
		filepath.Clean(verified.Manifest.Source.InstallDir) == target.InstallDir &&
		strings.EqualFold(verified.Manifest.Source.Environment, target.Environment) {
		return PreflightResult{}, &Error{Code: 10, Err: fmt.Errorf(
			"source and target identities unexpectedly match (%s / %s)",
			verified.Manifest.Source.Environment, target.InstallDir,
		)}
	}

	decision := compatibility.Evaluate(verified.Manifest, compatibility.Target{
		StackVersion:              target.StackVersion,
		PostgresMajor:             target.PostgresMajor,
		TimescaleVersion:          target.TimescaleVersion,
		DatabaseMinMigrationLevel: target.DatabaseMinMigrationLevel,
		DatabaseMaxMigrationLevel: target.DatabaseMaxMigrationLevel,
	})
	if !decision.Compatible {
		return PreflightResult{}, &Error{Code: 20, Err: fmt.Errorf(
			"Recovery Bundle is incompatible with target: %s",
			strings.Join(decision.Reasons, "; "),
		)}
	}

	confirmation := fmt.Sprintf("RESTORE %s INTO %s", verified.Manifest.BackupID, cfg.InstanceName)
	return PreflightResult{
		Status:        "READY",
		Mode:          mode,
		BackupID:      verified.Manifest.BackupID,
		BundlePath:    path,
		Source:        verified.Manifest.Source,
		SourceStack:   verified.Manifest.Stack,
		SourceDB:      verified.Manifest.Database,
		Target:        target,
		Compatibility: decision,
		Confirmation:  confirmation,
		MutatesTarget: false,
		DegradedRetry: retryRun != nil,
		RetrySafetyBackupID: func() string {
			if retryRun == nil {
				return ""
			}
			return retryRun.SafetyBackupID
		}(),
	}, nil
}

func degradedRetryRun(cfg config.Config, backupID string) (*runstate.Run, error) {
	data, err := os.ReadFile(filepath.Join(cfg.StateRoot, "current.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read restore state: %w", err)
	}
	var run runstate.Run
	if err := json.Unmarshal(data, &run); err != nil {
		return nil, fmt.Errorf("parse restore state: %w", err)
	}
	if run.Command != "restore" {
		return nil, nil
	}
	if run.Status != runstate.StatusFailed && run.Status != runstate.StatusInterrupted {
		return nil, nil
	}
	if run.SourceBackupID != backupID {
		return nil, fmt.Errorf("previous failed restore used source backup %s, requested retry uses %s", run.SourceBackupID, backupID)
	}
	if !strings.EqualFold(run.TargetEnvironment, cfg.Environment) {
		return nil, fmt.Errorf("previous restore target environment %s does not match %s", run.TargetEnvironment, cfg.Environment)
	}
	if filepath.Clean(run.TargetInstallDir) != filepath.Clean(cfg.InstallDir) {
		return nil, fmt.Errorf("previous restore target install dir %s does not match %s", run.TargetInstallDir, cfg.InstallDir)
	}
	if strings.TrimSpace(run.SafetyBackupID) == "" {
		return nil, fmt.Errorf("previous failed restore has no safety backup id")
	}
	return &run, nil
}

func ErrorCode(err error) int {
	if err == nil {
		return 0
	}
	if e, ok := err.(*Error); ok {
		return e.Code
	}
	return 80
}
