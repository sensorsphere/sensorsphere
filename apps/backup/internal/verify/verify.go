package verify

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/checksum"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/database"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
)

type Result struct {
	Manifest manifest.Manifest `json:"manifest"`
	Path     string            `json:"path"`
}

func Bundle(path string, requireComplete bool) (Result, error) {
	if requireComplete && !repository.IsComplete(path) {
		return Result{}, fmt.Errorf("backup is incomplete: %s", filepath.Base(path))
	}

	m, err := manifest.Read(filepath.Join(path, "manifest.json"))
	if err != nil {
		return Result{}, err
	}
	if filepath.Base(path) != m.BackupID {
		return Result{}, fmt.Errorf("backup directory id %s does not match manifest id %s", filepath.Base(path), m.BackupID)
	}

	checksumEntries, err := checksum.VerifyEntries(path)
	if err != nil {
		return Result{}, err
	}
	if !checksumEntries["manifest.json"] {
		return Result{}, fmt.Errorf("manifest.json is not covered by checksums")
	}

	for name, item := range m.Payload {
		if !item.Included {
			continue
		}
		if !safeRelative(item.Path) {
			return Result{}, fmt.Errorf("unsafe payload path for %s: %s", name, item.Path)
		}
		payloadPath := filepath.Join(path, filepath.FromSlash(item.Path))
		info, err := os.Stat(payloadPath)
		if err != nil {
			return Result{}, fmt.Errorf("payload %s missing: %w", name, err)
		}
		if info.IsDir() {
			return Result{}, fmt.Errorf("payload %s is unexpectedly a directory", name)
		}
		if item.SizeBytes > 0 && info.Size() != item.SizeBytes {
			return Result{}, fmt.Errorf("payload %s size mismatch: manifest=%d actual=%d", name, item.SizeBytes, info.Size())
		}
		if !checksumEntries[item.Path] {
			return Result{}, fmt.Errorf("payload %s is not covered by checksums: %s", name, item.Path)
		}
	}

	if requireComplete {
		complete, err := os.ReadFile(filepath.Join(path, "COMPLETE"))
		if err != nil {
			return Result{}, fmt.Errorf("read COMPLETE marker: %w", err)
		}
		expected := "backupId=" + m.BackupID + "\n"
		if !strings.Contains(string(complete), expected) {
			return Result{}, fmt.Errorf("COMPLETE marker does not match backup id %s", m.BackupID)
		}
	}

	dumpPath := filepath.Join(path, filepath.FromSlash(m.Payload["database"].Path))
	if err := database.VerifyDump(dumpPath); err != nil {
		return Result{}, err
	}

	appPath := filepath.Join(path, filepath.FromSlash(m.Payload["appData"].Path))
	if err := archive.VerifyZstd(appPath); err != nil {
		return Result{}, err
	}

	if item, ok := m.Payload["mosquitto"]; ok && item.Included {
		mqttPath := filepath.Join(path, filepath.FromSlash(item.Path))
		if err := archive.VerifyZstd(mqttPath); err != nil {
			return Result{}, err
		}
	}

	return Result{Manifest: m, Path: path}, nil
}

func safeRelative(path string) bool {
	if path == "" || filepath.IsAbs(path) {
		return false
	}
	clean := filepath.Clean(filepath.FromSlash(path))
	return clean != "." && clean != ".." && !strings.HasPrefix(clean, ".."+string(filepath.Separator))
}
