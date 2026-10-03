package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	backupop "github.com/sensorsphere/sensorsphere/apps/backup/internal/backup"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/retention"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/runstate"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/verify"
)

const BackupFormatVersion = 1

type BuildInfo struct {
	Version  string
	Revision string
}

type versionOutput struct {
	Name                string `json:"name"`
	Version             string `json:"version"`
	Revision            string `json:"revision"`
	BackupFormatVersion int    `json:"backupFormatVersion"`
	PostgresMajor       int    `json:"postgresMajor"`
}

type verifyOutput struct {
	Status   string `json:"status"`
	BackupID string `json:"backupId"`
	Path     string `json:"path"`
}

type listItem struct {
	BackupID  string `json:"backupId"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt,omitempty"`
	Stack     string `json:"stackVersion,omitempty"`
	SizeBytes int64  `json:"sizeBytes"`
	Path      string `json:"path"`
}

type statusOutput struct {
	Status               string        `json:"status"`
	BackupRoot           string        `json:"backupRoot"`
	StateRoot            string        `json:"stateRoot"`
	LastRun              *runstate.Run `json:"lastRun,omitempty"`
	LastVerifiedBackupID string        `json:"lastVerifiedBackupId,omitempty"`
	LastVerifiedAt       string        `json:"lastVerifiedAt,omitempty"`
	AgeSeconds           int64         `json:"ageSeconds,omitempty"`
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "SensorSphere Backup")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintln(w, "  sensorsphere-backup <command> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  version                  Show backup module build information")
	fmt.Fprintln(w, "  create [options]         Create and verify a local Recovery Bundle")
	fmt.Fprintln(w, "  list [options]           List local Recovery Bundles")
	fmt.Fprintln(w, "  show <id|latest>         Show Recovery Bundle metadata")
	fmt.Fprintln(w, "  status [options]         Show backup health/status")
	fmt.Fprintln(w, "  verify <id|latest>       Verify a Recovery Bundle")
	fmt.Fprintln(w, "  prune [options]          Plan/apply local retention")
	fmt.Fprintln(w, "  help                     Show this help")
}

func Run(args []string, stdout, stderr io.Writer, info BuildInfo) int {
	if len(args) == 0 {
		usage(stderr)
		return 2
	}

	switch args[0] {
	case "help", "--help", "-h":
		if len(args) != 1 {
			fmt.Fprintln(stderr, "ERROR: help does not accept arguments")
			return 2
		}
		usage(stdout)
		return 0
	case "version":
		return runVersion(args[1:], stdout, stderr, info)
	case "create":
		return runCreate(args[1:], stdout, stderr, info)
	case "list":
		return runList(args[1:], stdout, stderr)
	case "show":
		return runShow(args[1:], stdout, stderr)
	case "status":
		return runStatus(args[1:], stdout, stderr)
	case "verify":
		return runVerify(args[1:], stdout, stderr)
	case "prune":
		return runPrune(args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "ERROR: unknown command: %s\n\n", args[0])
		usage(stderr)
		return 2
	}
}

func isHelp(args []string) bool {
	return len(args) == 1 && (args[0] == "--help" || args[0] == "-h" || args[0] == "help")
}

func loadConfig(stderr io.Writer) (config.Config, int) {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return config.Config{}, 10
	}
	return cfg, 0
}

func runVersion(args []string, stdout, stderr io.Writer, info BuildInfo) int {
	jsonMode := false
	for _, arg := range args {
		switch arg {
		case "--json":
			jsonMode = true
		case "--help", "-h":
			fmt.Fprintln(stdout, "Usage: sensorsphere-backup version [--json]")
			return 0
		default:
			fmt.Fprintf(stderr, "ERROR: unknown version option: %s\n", arg)
			return 2
		}
	}
	result := versionOutput{
		Name: "sensorsphere-backup", Version: info.Version, Revision: info.Revision,
		BackupFormatVersion: BackupFormatVersion, PostgresMajor: 17,
	}
	if jsonMode {
		return encodeJSON(stdout, stderr, result)
	}
	fmt.Fprintf(stdout, "SensorSphere Backup %s\n", result.Version)
	fmt.Fprintf(stdout, "Revision: %s\n", result.Revision)
	fmt.Fprintf(stdout, "Backup format: %d\n", result.BackupFormatVersion)
	fmt.Fprintf(stdout, "PostgreSQL major: %d\n", result.PostgresMajor)
	return 0
}

func runCreate(args []string, stdout, stderr io.Writer, info BuildInfo) int {
	if isHelp(args) {
		fmt.Fprintln(stdout, "Usage: sensorsphere-backup create [--json] [--label <text>] [--no-mosquitto] [--minimum-free-mb <n>]")
		return 0
	}
	var opts backupop.CreateOptions
	jsonMode := false
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			jsonMode = true
		case "--no-mosquitto":
			opts.NoMosquitto = true
		case "--label":
			i++
			if i >= len(args) {
				fmt.Fprintln(stderr, "ERROR: --label requires a value")
				return 2
			}
			opts.Label = args[i]
		case "--minimum-free-mb":
			i++
			if i >= len(args) {
				fmt.Fprintln(stderr, "ERROR: --minimum-free-mb requires a value")
				return 2
			}
			value, err := strconv.ParseInt(args[i], 10, 64)
			if err != nil || value < 0 {
				fmt.Fprintln(stderr, "ERROR: --minimum-free-mb must be a non-negative integer")
				return 2
			}
			opts.MinimumFreeMB = value
		default:
			fmt.Fprintf(stderr, "ERROR: unknown create option: %s\n", args[i])
			return 2
		}
	}

	cfg, code := loadConfig(stderr)
	if code != 0 {
		return code
	}
	result, err := backupop.Create(cfg, backupop.BuildInfo{Version: info.Version, Revision: info.Revision}, opts)
	if err != nil {
		if jsonMode {
			_ = encodeJSON(stdout, stderr, map[string]any{"status": "FAILED", "error": err.Error(), "code": backupop.ErrorCode(err)})
		} else {
			fmt.Fprintf(stderr, "ERROR: %v\n", err)
		}
		return backupop.ErrorCode(err)
	}
	if jsonMode {
		return encodeJSON(stdout, stderr, result)
	}
	fmt.Fprintln(stdout, "SensorSphere Backup")
	fmt.Fprintln(stdout)
	fmt.Fprintf(stdout, "Backup ID........... %s\n", result.BackupID)
	fmt.Fprintf(stdout, "Status.............. %s\n", result.Status)
	fmt.Fprintf(stdout, "Size................ %d bytes\n", result.SizeBytes)
	fmt.Fprintf(stdout, "Duration............ %d ms\n", result.DurationMillis)
	fmt.Fprintf(stdout, "Path................ %s\n", result.Path)
	return 0
}

func runList(args []string, stdout, stderr io.Writer) int {
	if isHelp(args) {
		fmt.Fprintln(stdout, "Usage: sensorsphere-backup list [--json] [--all] [--limit <n>]")
		return 0
	}
	jsonMode, all, limit := false, false, 0
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			jsonMode = true
		case "--all":
			all = true
		case "--limit":
			i++
			if i >= len(args) {
				fmt.Fprintln(stderr, "ERROR: --limit requires a value")
				return 2
			}
			n, err := strconv.Atoi(args[i])
			if err != nil || n <= 0 {
				fmt.Fprintln(stderr, "ERROR: --limit must be a positive integer")
				return 2
			}
			limit = n
		default:
			fmt.Fprintf(stderr, "ERROR: unknown list option: %s\n", args[i])
			return 2
		}
	}
	cfg, code := loadConfig(stderr)
	if code != 0 {
		return code
	}
	entries, err := repository.List(cfg.BackupRoot, all)
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 80
	}
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}
	items := make([]listItem, 0, len(entries))
	for _, entry := range entries {
		item := listItem{BackupID: entry.ID, Path: entry.Path, SizeBytes: entry.SizeBytes}
		if entry.Complete {
			item.Status = "COMPLETE"
			if m, err := manifest.Read(filepath.Join(entry.Path, "manifest.json")); err == nil {
				item.CreatedAt = m.CreatedAt
				item.Stack = m.Stack.StackVersion
				if _, err := verify.Bundle(entry.Path, true); err == nil {
					item.Status = "VERIFIED"
				} else {
					item.Status = "CORRUPT"
				}
			} else {
				item.Status = "CORRUPT"
			}
		} else {
			item.Status = "INCOMPLETE"
		}
		items = append(items, item)
	}
	if jsonMode {
		return encodeJSON(stdout, stderr, items)
	}
	for _, item := range items {
		fmt.Fprintf(stdout, "%-28s %-10s %-20s %12d  %s\n", item.BackupID, item.Status, item.Stack, item.SizeBytes, item.CreatedAt)
	}
	return 0
}

func runShow(args []string, stdout, stderr io.Writer) int {
	if isHelp(args) {
		fmt.Fprintln(stdout, "Usage: sensorsphere-backup show <backup-id|latest> [--json]")
		return 0
	}
	jsonMode := false
	id := ""
	for _, arg := range args {
		if arg == "--json" {
			jsonMode = true
			continue
		}
		if id != "" {
			fmt.Fprintln(stderr, "ERROR: show accepts one backup id")
			return 2
		}
		id = arg
	}
	if id == "" {
		fmt.Fprintln(stderr, "ERROR: show requires <backup-id|latest>")
		return 2
	}
	cfg, code := loadConfig(stderr)
	if code != 0 {
		return code
	}
	path, err := repository.Resolve(cfg.BackupRoot, id)
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 60
	}
	m, err := manifest.Read(filepath.Join(path, "manifest.json"))
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 60
	}
	if jsonMode {
		return encodeJSON(stdout, stderr, m)
	}
	data, _ := json.MarshalIndent(m, "", "  ")
	fmt.Fprintln(stdout, string(data))
	return 0
}

func runStatus(args []string, stdout, stderr io.Writer) int {
	if isHelp(args) {
		fmt.Fprintln(stdout, "Usage: sensorsphere-backup status [--json]")
		return 0
	}
	jsonMode := false
	for _, arg := range args {
		if arg == "--json" {
			jsonMode = true
		} else {
			fmt.Fprintf(stderr, "ERROR: unknown status option: %s\n", arg)
			return 2
		}
	}
	cfg, code := loadConfig(stderr)
	if code != 0 {
		return code
	}
	out := statusOutput{Status: "NEVER", BackupRoot: cfg.BackupRoot, StateRoot: cfg.StateRoot}
	if data, err := os.ReadFile(filepath.Join(cfg.StateRoot, "current.json")); err == nil {
		var run runstate.Run
		if json.Unmarshal(data, &run) == nil {
			out.LastRun = &run
		}
	}
	entries, err := repository.List(cfg.BackupRoot, false)
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 80
	}
	now := time.Now().UTC()
	for _, entry := range entries {
		result, err := verify.Bundle(entry.Path, true)
		if err != nil {
			continue
		}
		t, err := time.Parse(time.RFC3339Nano, result.Manifest.Verification.VerifiedAt)
		if err != nil {
			t, err = time.Parse(time.RFC3339Nano, result.Manifest.CompletedAt)
		}
		if err != nil {
			continue
		}
		out.LastVerifiedBackupID = entry.ID
		out.LastVerifiedAt = t.UTC().Format(time.RFC3339Nano)
		age := now.Sub(t.UTC())
		if age < 0 {
			age = 0
		}
		out.AgeSeconds = int64(age.Seconds())
		out.Status = "OK"
		if cfg.WarningAgeHours > 0 && age > time.Duration(cfg.WarningAgeHours)*time.Hour {
			out.Status = "WARNING"
		}
		if cfg.CriticalAgeHours > 0 && age > time.Duration(cfg.CriticalAgeHours)*time.Hour {
			out.Status = "CRITICAL"
		}
		break
	}
	if jsonMode {
		return encodeJSON(stdout, stderr, out)
	}
	fmt.Fprintf(stdout, "Status: %s\n", out.Status)
	if out.LastVerifiedBackupID != "" {
		fmt.Fprintf(stdout, "Last verified backup: %s\n", out.LastVerifiedBackupID)
		fmt.Fprintf(stdout, "Verified at: %s\n", out.LastVerifiedAt)
		fmt.Fprintf(stdout, "Age: %d seconds\n", out.AgeSeconds)
	}
	if out.LastRun != nil {
		fmt.Fprintf(stdout, "Last run: %s %s\n", out.LastRun.RunID, out.LastRun.Status)
	}
	fmt.Fprintf(stdout, "Repository: %s\n", out.BackupRoot)
	return 0
}

func runVerify(args []string, stdout, stderr io.Writer) int {
	if isHelp(args) {
		fmt.Fprintln(stdout, "Usage: sensorsphere-backup verify <backup-id|latest> [--json]")
		return 0
	}
	jsonMode := false
	var id string
	for _, arg := range args {
		if arg == "--json" {
			jsonMode = true
			continue
		}
		if id != "" {
			fmt.Fprintln(stderr, "ERROR: verify accepts one backup id")
			return 2
		}
		id = arg
	}
	if id == "" {
		fmt.Fprintln(stderr, "ERROR: verify requires <backup-id|latest>")
		return 2
	}
	cfg, code := loadConfig(stderr)
	if code != 0 {
		return code
	}
	path, err := repository.Resolve(cfg.BackupRoot, id)
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 60
	}
	result, err := verify.Bundle(path, true)
	if err != nil {
		if jsonMode {
			_ = encodeJSON(stdout, stderr, map[string]any{"status": "FAILED", "error": err.Error(), "code": 60})
		} else {
			fmt.Fprintf(stderr, "ERROR: %v\n", err)
		}
		return 60
	}
	out := verifyOutput{Status: "VERIFIED", BackupID: result.Manifest.BackupID, Path: filepath.Clean(path)}
	if jsonMode {
		return encodeJSON(stdout, stderr, out)
	}
	fmt.Fprintf(stdout, "Backup %s: VERIFIED\n", out.BackupID)
	fmt.Fprintf(stdout, "Path: %s\n", out.Path)
	return 0
}

func runPrune(args []string, stdout, stderr io.Writer) int {
	if isHelp(args) {
		fmt.Fprintln(stdout, "Usage: sensorsphere-backup prune [--dry-run|--apply] [--json]")
		return 0
	}
	jsonMode, apply := false, false
	for _, arg := range args {
		switch arg {
		case "--json":
			jsonMode = true
		case "--dry-run":
			apply = false
		case "--apply":
			apply = true
		default:
			fmt.Fprintf(stderr, "ERROR: unknown prune option: %s\n", arg)
			return 2
		}
	}
	cfg, code := loadConfig(stderr)
	if code != 0 {
		return code
	}
	var lock *runstate.Lock
	var err error
	if apply {
		lock, err = runstate.Acquire(cfg.StateRoot)
		if err != nil {
			fmt.Fprintf(stderr, "ERROR: %v\n", err)
			return 11
		}
		defer lock.Close()
	}
	plan, err := retention.Plan(cfg.BackupRoot, retention.Policy{
		Daily: cfg.RetentionDaily, Weekly: cfg.RetentionWeekly, Monthly: cfg.RetentionMonthly,
	})
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 70
	}
	if apply {
		if err := retention.Apply(plan); err != nil {
			fmt.Fprintf(stderr, "ERROR: %v\n", err)
			return 70
		}
	}
	if jsonMode {
		return encodeJSON(stdout, stderr, map[string]any{"mode": map[bool]string{true: "APPLY", false: "DRY-RUN"}[apply], "decisions": plan})
	}
	fmt.Fprintf(stdout, "Mode: %s\n", map[bool]string{true: "APPLY", false: "DRY-RUN"}[apply])
	for _, decision := range plan {
		fmt.Fprintf(stdout, "%-7s %-28s %s\n", decision.Action, decision.BackupID, decision.Reason)
	}
	return 0
}

func encodeJSON(stdout, stderr io.Writer, value any) int {
	encoder := json.NewEncoder(stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		fmt.Fprintf(stderr, "ERROR: cannot encode JSON output: %v\n", err)
		return 90
	}
	return 0
}

// Avoid accidental future use of shell parsing for command input.
var _ = strings.TrimSpace
