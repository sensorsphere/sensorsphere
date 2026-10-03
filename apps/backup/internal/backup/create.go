package backup

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/checksum"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/ownership"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/verify"
)

type BuildInfo struct {
	Version  string
	Revision string
}

type CreateOptions struct {
	Label         string
	NoMosquitto   bool
	MinimumFreeMB int64
}

type Result struct {
	BackupID       string `json:"backupId"`
	RunID          string `json:"runId"`
	Path           string `json:"path"`
	SizeBytes      int64  `json:"sizeBytes"`
	DurationMillis int64  `json:"durationMillis"`
	Status         string `json:"status"`
}

type OperationError struct {
	Code int
	Err  error
}

func (e *OperationError) Error() string { return e.Err.Error() }
func (e *OperationError) Unwrap() error { return e.Err }

func ErrorCode(err error) int {
	if err == nil {
		return 0
	}
	if op, ok := err.(*OperationError); ok {
		return op.Code
	}
	return 90
}

func opError(code int, format string, args ...any) error {
	return &OperationError{Code: code, Err: fmt.Errorf(format, args...)}
}

func Create(cfg config.Config, build BuildInfo, opts CreateOptions) (result Result, retErr error) {
	if err := cfg.ValidateForCreate(); err != nil {
		return Result{}, opError(10, "%v", err)
	}
	if len(opts.Label) > 128 || strings.ContainsAny(opts.Label, "\r\n") {
		return Result{}, opError(10, "backup label must be at most 128 characters and single-line")
	}

	started := time.Now().UTC()
	instanceOwner, err := ownership.FromPath(cfg.InstanceRoot)
	if err != nil {
		return Result{}, opError(10, "%v", err)
	}

	runID, err := newRunID()
	if err != nil {
		return Result{}, opError(90, "generate run id: %v", err)
	}

	run := runstate.Run{
		RunID:     runID,
		Command:   "create",
		StartedAt: started.Format(time.RFC3339Nano),
		Status:    runstate.StatusStarting,
		Phase:     "PRECHECK",
	}

	if err := runstate.Ensure(cfg.StateRoot); err != nil {
		return Result{}, opError(10, "%v", err)
	}
	if err := ownership.ApplyTree(cfg.StateRoot, instanceOwner); err != nil {
		return Result{}, opError(10, "%v", err)
	}
	_ = runstate.Write(cfg.StateRoot, run)

	lock, err := runstate.Acquire(cfg.StateRoot)
	if err != nil {
		run.Status = runstate.StatusFailed
		run.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
		run.ErrorCode = 11
		run.ErrorMessage = err.Error()
		_ = runstate.Write(cfg.StateRoot, run)
		return Result{}, opError(11, "%v", err)
	}
	defer lock.Close()

	var paths repository.Paths
	defer func() {
		if retErr == nil {
			return
		}
		code := ErrorCode(retErr)
		run.Status = runstate.StatusFailed
		run.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
		run.ErrorCode = code
		run.ErrorMessage = retErr.Error()
		_ = runstate.Write(cfg.StateRoot, run)
		if paths.Incomplete != "" {
			_ = ownership.ApplyTree(paths.Incomplete, instanceOwner)
		}
		_ = ownership.ApplyTree(cfg.StateRoot, instanceOwner)
	}()

	paths, err = repository.Begin(cfg.BackupRoot, started)
	if err != nil {
		return Result{}, opError(80, "%v", err)
	}
	if err := ownership.Apply(cfg.BackupRoot, instanceOwner); err != nil {
		return Result{}, opError(80, "%v", err)
	}
	if err := ownership.Apply(filepath.Join(cfg.BackupRoot, ".incomplete"), instanceOwner); err != nil {
		return Result{}, opError(80, "%v", err)
	}
	run.BackupID = paths.ID
	run.Status = runstate.StatusRunning
	_ = runstate.Write(cfg.StateRoot, run)

	dbCfg := database.Config{
		Host: cfg.DBHost, Port: cfg.DBPort, Name: cfg.DBName,
		User: cfg.DBUser, Password: cfg.DBPassword,
	}

	run.Phase = "DATABASE"
	_ = runstate.Write(cfg.StateRoot, run)

	dbMeta, err := database.ReadMetadata(dbCfg)
	if err != nil {
		return Result{}, opError(20, "%v", err)
	}
	minimumFree := opts.MinimumFreeMB * 1024 * 1024
	if minimumFree <= 0 {
		minimumFree = 512 * 1024 * 1024
	}
	requiredFree := dbMeta.SourceSizeBytes + minimumFree
	if err := requireFreeSpace(cfg.BackupRoot, requiredFree); err != nil {
		return Result{}, opError(80, "%v", err)
	}

	dbDump := filepath.Join(paths.Incomplete, "database", "database.dump")
	if err := database.Dump(dbCfg, dbDump); err != nil {
		return Result{}, opError(21, "%v", err)
	}
	globalsPath := filepath.Join(paths.Incomplete, "database", "globals.sql")
	if err := database.DumpGlobals(dbCfg, globalsPath); err != nil {
		return Result{}, opError(21, "%v", err)
	}

	run.Phase = "APP_DATA"
	_ = runstate.Write(cfg.StateRoot, run)
	appArchive := filepath.Join(paths.Incomplete, "app", "app-data.tar.zst")
	if err := archive.CreateZstd(cfg.AppRoot, appArchive); err != nil {
		return Result{}, opError(30, "%v", err)
	}

	mosquittoIncluded := !opts.NoMosquitto
	mosquittoArchive := filepath.Join(paths.Incomplete, "mosquitto", "mosquitto-data.tar.zst")
	if mosquittoIncluded {
		run.Phase = "MOSQUITTO"
		_ = runstate.Write(cfg.StateRoot, run)
		if err := archive.CreateZstd(cfg.MosquittoRoot, mosquittoArchive); err != nil {
			return Result{}, opError(31, "%v", err)
		}
	}

	run.Phase = "INSTANCE_METADATA"
	_ = runstate.Write(cfg.StateRoot, run)
	instanceDir := filepath.Join(paths.Incomplete, "instance")
	if err := os.MkdirAll(instanceDir, 0o700); err != nil {
		return Result{}, opError(40, "create instance metadata directory: %v", err)
	}
	if err := captureInstanceMetadata(cfg, instanceDir); err != nil {
		return Result{}, opError(40, "%v", err)
	}

	run.Phase = "MANIFEST"
	_ = runstate.Write(cfg.StateRoot, run)

	completedCandidate := time.Now().UTC()
	m, err := buildManifest(cfg, build, opts, paths, runID, started, completedCandidate, dbMeta, mosquittoIncluded)
	if err != nil {
		return Result{}, opError(50, "%v", err)
	}
	if err := manifest.Write(filepath.Join(paths.Incomplete, "manifest.json"), m); err != nil {
		return Result{}, opError(50, "%v", err)
	}
	if err := checksum.Generate(paths.Incomplete); err != nil {
		return Result{}, opError(50, "%v", err)
	}

	run.Phase = "VERIFY"
	_ = runstate.Write(cfg.StateRoot, run)
	if _, err := verify.Bundle(paths.Incomplete, false); err != nil {
		return Result{}, opError(60, "%v", err)
	}

	run.Phase = "PUBLISH"
	_ = runstate.Write(cfg.StateRoot, run)
	completed := time.Now().UTC()
	if err := repository.Publish(paths, completed); err != nil {
		return Result{}, opError(80, "%v", err)
	}
	sizeBytes, err := repository.DirSize(paths.Final)
	if err != nil {
		return Result{}, opError(80, "calculate final backup size: %v", err)
	}

	result = Result{
		BackupID:       paths.ID,
		RunID:          runID,
		Path:           paths.Final,
		SizeBytes:      sizeBytes,
		DurationMillis: time.Since(started).Milliseconds(),
		Status:         "VERIFIED",
	}

	run.Status = runstate.StatusSuccess
	run.Phase = "COMPLETE"
	run.CompletedAt = completed.Format(time.RFC3339Nano)
	run.Details = map[string]any{
		"sizeBytes":      sizeBytes,
		"durationMillis": result.DurationMillis,
		"path":           paths.Final,
	}
	if err := runstate.Write(cfg.StateRoot, run); err != nil {
		return Result{}, opError(90, "write final run state: %v", err)
	}
	if err := ownership.ApplyTree(paths.Final, instanceOwner); err != nil {
		return Result{}, opError(80, "%v", err)
	}
	if err := ownership.ApplyTree(cfg.StateRoot, instanceOwner); err != nil {
		return Result{}, opError(80, "%v", err)
	}
	return result, nil
}

func buildManifest(
	cfg config.Config,
	build BuildInfo,
	opts CreateOptions,
	paths repository.Paths,
	runID string,
	started, completed time.Time,
	dbMeta database.Metadata,
	mosquittoIncluded bool,
) (manifest.Manifest, error) {
	fileSize := func(relative string) (int64, error) {
		info, err := os.Stat(filepath.Join(paths.Incomplete, filepath.FromSlash(relative)))
		if err != nil {
			return 0, err
		}
		return info.Size(), nil
	}
	dbSize, err := fileSize("database/database.dump")
	if err != nil {
		return manifest.Manifest{}, err
	}
	globalsSize, err := fileSize("database/globals.sql")
	if err != nil {
		return manifest.Manifest{}, err
	}
	appSize, err := fileSize("app/app-data.tar.zst")
	if err != nil {
		return manifest.Manifest{}, err
	}
	instanceSize, err := fileSize("instance/installation.json")
	if err != nil {
		return manifest.Manifest{}, err
	}

	payload := map[string]manifest.PayloadItem{
		"database": {
			Included: true, Path: "database/database.dump", SizeBytes: dbSize, Required: true,
		},
		"globals": {
			Included: true, Path: "database/globals.sql", SizeBytes: globalsSize, Required: true,
		},
		"appData": {
			Included: true, Path: "app/app-data.tar.zst", SizeBytes: appSize, Required: true,
		},
		"instanceMetadata": {
			Included: true, Path: "instance/installation.json", SizeBytes: instanceSize, Required: true,
		},
	}
	if mosquittoIncluded {
		mqttSize, err := fileSize("mosquitto/mosquitto-data.tar.zst")
		if err != nil {
			return manifest.Manifest{}, err
		}
		payload["mosquitto"] = manifest.PayloadItem{
			Included: true, Path: "mosquitto/mosquitto-data.tar.zst", SizeBytes: mqttSize, Required: false,
		}
	} else {
		payload["mosquitto"] = manifest.PayloadItem{Included: false, Required: false}
	}

	stackMeta, err := parseStackRelease(filepath.Join(paths.Incomplete, "instance", "stack-release.yaml"))
	if err != nil {
		return manifest.Manifest{}, err
	}
	components := stackMeta.Components
	if components == nil {
		components = map[string]manifest.Component{}
	}
	components["backup"] = manifest.Component{
		Version: build.Version,
		Image:   cfg.Image("sensorsphere-backup", build.Version),
	}

	m := manifest.Manifest{
		BackupFormatVersion: manifest.FormatVersion,
		BackupID:            paths.ID,
		RunID:               runID,
		Label:               opts.Label,
		CreatedAt:           started.Format(time.RFC3339Nano),
		CompletedAt:         completed.Format(time.RFC3339Nano),
		Tool: manifest.Tool{
			Name: "sensorsphere-backup", Version: build.Version, Revision: build.Revision,
		},
		Source: manifest.Source{
			Host: cfg.InstallHost, InstallDir: cfg.InstallDir,
			ComposeProject: cfg.ComposeProject, Environment: cfg.Environment,
			InstanceName: cfg.InstanceName,
		},
		Stack: manifest.Stack{
			StackVersion:  stackMeta.StackVersion,
			SchemaVersion: stackMeta.SchemaVersion,
			Components:    components,
		},
		Database: manifest.Database{
			Name: cfg.DBName, ServerVersion: dbMeta.ServerVersion, ServerMajor: dbMeta.ServerMajor,
			TimescaleVersion: dbMeta.TimescaleVersion, MigrationLevel: dbMeta.MigrationLevel,
			SourceSizeBytes: dbMeta.SourceSizeBytes, DumpSizeBytes: dbSize,
		},
		Payload: payload,
		Verification: manifest.Verification{
			Status: "VERIFIED", VerifiedAt: completed.Format(time.RFC3339Nano),
			ChecksumStatus: "OK", DumpCatalogStatus: "OK", ArchiveStatus: "OK",
		},
	}
	m.InstanceSecrets.Included = false
	return m, nil
}

func captureInstanceMetadata(cfg config.Config, destination string) error {
	stackSource, err := findStackManifest(cfg)
	if err != nil {
		return err
	}
	if err := copyFile(stackSource, filepath.Join(destination, "stack-release.yaml")); err != nil {
		return err
	}

	composeSource := filepath.Join(cfg.InstanceRoot, "docker-compose.yml")
	if _, err := os.Stat(composeSource); err != nil {
		return fmt.Errorf("docker-compose.yml is required in instance metadata: %w", err)
	}
	if err := copyFile(composeSource, filepath.Join(destination, "docker-compose.yml")); err != nil {
		return err
	}

	installedSource := filepath.Join(cfg.InstanceRoot, ".installed")
	if _, err := os.Stat(installedSource); err == nil {
		if err := copyFile(installedSource, filepath.Join(destination, "installed.txt")); err != nil {
			return err
		}
	}

	metadata := map[string]any{
		"instanceName":     cfg.InstanceName,
		"environment":      cfg.Environment,
		"sourceHost":       cfg.InstallHost,
		"sourceInstallDir": cfg.InstallDir,
		"composeProject":   cfg.ComposeProject,
		"stackVersion":     cfg.StackVersion,
		"capturedAt":       time.Now().UTC().Format(time.RFC3339Nano),
		"instanceSecrets":  map[string]any{"included": false},
	}
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("encode installation metadata: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(filepath.Join(destination, "installation.json"), data, 0o600); err != nil {
		return fmt.Errorf("write installation metadata: %w", err)
	}
	return nil
}

func findStackManifest(cfg config.Config) (string, error) {
	candidates := []string{
		filepath.Join(cfg.InstanceRoot, ".stack-release.yaml"),
		filepath.Join(cfg.InstanceRoot, "stack-release.yaml"),
	}
	if cfg.StackVersion != "" {
		candidates = append(candidates, filepath.Join(cfg.InstanceRoot, "releases", "stacks", cfg.StackVersion+".yaml"))
	}
	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err == nil && info.Mode().IsRegular() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no Stack Release manifest found for stack %q", cfg.StackVersion)
}

type stackReleaseMetadata struct {
	StackVersion  string
	SchemaVersion int
	Components    map[string]manifest.Component
}

func parseStackRelease(path string) (stackReleaseMetadata, error) {
	file, err := os.Open(path)
	if err != nil {
		return stackReleaseMetadata{}, fmt.Errorf("open Stack Release manifest: %w", err)
	}
	defer file.Close()

	result := stackReleaseMetadata{Components: map[string]manifest.Component{}}
	inComponents := false
	currentComponent := ""

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if !strings.HasPrefix(line, " ") {
			inComponents = trimmed == "components:"
			currentComponent = ""
			switch {
			case strings.HasPrefix(trimmed, "stackVersion:"):
				result.StackVersion = strings.TrimSpace(strings.TrimPrefix(trimmed, "stackVersion:"))
			case strings.HasPrefix(trimmed, "schemaVersion:"):
				raw := strings.TrimSpace(strings.TrimPrefix(trimmed, "schemaVersion:"))
				value, err := strconv.Atoi(raw)
				if err != nil {
					return stackReleaseMetadata{}, fmt.Errorf("invalid Stack Release schemaVersion %q", raw)
				}
				result.SchemaVersion = value
			}
			continue
		}
		if !inComponents {
			continue
		}
		if strings.HasPrefix(line, "  ") && !strings.HasPrefix(line, "    ") && strings.HasSuffix(trimmed, ":") {
			currentComponent = strings.TrimSuffix(trimmed, ":")
			if currentComponent != "" {
				result.Components[currentComponent] = manifest.Component{}
			}
			continue
		}
		if currentComponent == "" || !strings.HasPrefix(line, "    ") {
			continue
		}
		component := result.Components[currentComponent]
		switch {
		case strings.HasPrefix(trimmed, "version:"):
			component.Version = strings.TrimSpace(strings.TrimPrefix(trimmed, "version:"))
		case strings.HasPrefix(trimmed, "image:"):
			component.Image = strings.TrimSpace(strings.TrimPrefix(trimmed, "image:"))
		}
		result.Components[currentComponent] = component
	}
	if err := scanner.Err(); err != nil {
		return stackReleaseMetadata{}, fmt.Errorf("read Stack Release manifest: %w", err)
	}
	if result.StackVersion == "" || result.SchemaVersion == 0 {
		return stackReleaseMetadata{}, fmt.Errorf("Stack Release manifest is missing stackVersion/schemaVersion")
	}
	for _, required := range []string{"api", "frontend", "ingestion", "nginx", "migrations"} {
		component, ok := result.Components[required]
		if !ok || component.Version == "" || component.Image == "" {
			return stackReleaseMetadata{}, fmt.Errorf("Stack Release component %s is incomplete", required)
		}
	}
	return result, nil
}

func copyFile(source, destination string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return fmt.Errorf("read %s: %w", source, err)
	}
	if err := os.WriteFile(destination, data, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", destination, err)
	}
	return nil
}

func requireFreeSpace(path string, required int64) error {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return fmt.Errorf("check backup filesystem free space: %w", err)
	}
	free := int64(stat.Bavail) * int64(stat.Bsize)
	if free < required {
		return fmt.Errorf("insufficient backup free space: available=%d required=%d", free, required)
	}
	return nil
}

func newRunID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

func ParseMinimumFreeMB(value string) (int64, error) {
	if value == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(value, 10, 64)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("invalid minimum free MB")
	}
	return n, nil
}
