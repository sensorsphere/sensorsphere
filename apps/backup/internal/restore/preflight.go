package restore

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/compatibility"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
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
	DatabaseMinMigrationLevel int    `json:"databaseMinMigrationLevel"`
	DatabaseMaxMigrationLevel int    `json:"databaseMaxMigrationLevel"`
}

type PreflightResult struct {
	Status        string                 `json:"status"`
	Mode          Mode                   `json:"mode"`
	BackupID      string                 `json:"backupId"`
	BundlePath    string                 `json:"bundlePath"`
	Source        manifest.Source        `json:"source"`
	SourceStack   manifest.Stack         `json:"sourceStack"`
	SourceDB      manifest.Database      `json:"sourceDatabase"`
	Target        TargetIdentity         `json:"target"`
	Compatibility compatibility.Decision `json:"compatibility"`
	Confirmation  string                 `json:"confirmation"`
	MutatesTarget bool                   `json:"mutatesTarget"`
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

	dbMeta, err := database.ReadMetadata(database.Config{
		Host: cfg.DBHost, Port: cfg.DBPort, Name: cfg.DBName, User: cfg.DBUser, Password: cfg.DBPassword,
	})
	if err != nil {
		return PreflightResult{}, &Error{Code: 10, Err: fmt.Errorf("read target database metadata: %w", err)}
	}

	target := TargetIdentity{
		InstanceName:              cfg.InstanceName,
		Environment:               cfg.Environment,
		Host:                      cfg.InstallHost,
		InstallDir:                filepath.Clean(cfg.InstallDir),
		ComposeProject:            cfg.ComposeProject,
		DataRoot:                  cfg.DataRoot,
		StackVersion:              cfg.StackVersion,
		PostgresMajor:             dbMeta.ServerMajor,
		PostgresVersion:           dbMeta.ServerVersion,
		TimescaleVersion:          dbMeta.TimescaleVersion,
		MigrationLevel:            dbMeta.MigrationLevel,
		DatabaseMinMigrationLevel: cfg.DatabaseMinMigrationLevel,
		DatabaseMaxMigrationLevel: cfg.DatabaseMaxMigrationLevel,
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
	}, nil
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
