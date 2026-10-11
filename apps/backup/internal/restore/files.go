package restore

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/archive"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
)

type PersistentRestoreResult struct {
	AppDataRestored   bool `json:"appDataRestored"`
	MosquittoRestored bool `json:"mosquittoRestored"`
}

func RestorePersistentData(cfg config.Config, bundlePath string, m manifest.Manifest) (PersistentRestoreResult, error) {
	appItem, ok := m.Payload["appData"]
	if !ok || !appItem.Included || appItem.Path == "" {
		return PersistentRestoreResult{}, fmt.Errorf("Recovery Bundle appData payload is missing")
	}
	appArchive := filepath.Join(bundlePath, filepath.FromSlash(appItem.Path))
	if err := ReplaceArchiveContents(appArchive, cfg.AppRoot); err != nil {
		return PersistentRestoreResult{}, fmt.Errorf("restore application data: %w", err)
	}
	result := PersistentRestoreResult{AppDataRestored: true}

	mqttItem, ok := m.Payload["mosquitto"]
	if !ok || !mqttItem.Included {
		return result, nil
	}
	mqttArchive := filepath.Join(bundlePath, filepath.FromSlash(mqttItem.Path))
	if err := ReplaceArchiveContents(mqttArchive, cfg.MosquittoRoot); err != nil {
		return result, fmt.Errorf("restore Mosquitto data: %w", err)
	}
	result.MosquittoRestored = true
	return result, nil
}

func ReplaceArchiveContents(archivePath, targetRoot string) error {
	targetRoot = filepath.Clean(targetRoot)
	if targetRoot == "." || targetRoot == string(filepath.Separator) || !filepath.IsAbs(targetRoot) {
		return fmt.Errorf("unsafe restore target root: %q", targetRoot)
	}
	if err := archive.VerifyRestoreSafeZstd(archivePath); err != nil {
		return fmt.Errorf("verify restore archive: %w", err)
	}
	if err := os.MkdirAll(targetRoot, 0o700); err != nil {
		return fmt.Errorf("create restore target: %w", err)
	}
	info, err := os.Stat(targetRoot)
	if err != nil {
		return fmt.Errorf("stat restore target: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("restore target is not a directory: %s", targetRoot)
	}

	staging, err := os.MkdirTemp(targetRoot, ".restore-staging-")
	if err != nil {
		return fmt.Errorf("create restore staging directory: %w", err)
	}
	stagingBase := filepath.Base(staging)
	defer os.RemoveAll(staging)

	rollback, err := os.MkdirTemp(targetRoot, ".restore-previous-")
	if err != nil {
		return fmt.Errorf("create restore rollback directory: %w", err)
	}
	rollbackBase := filepath.Base(rollback)
	defer os.RemoveAll(rollback)

	cmd := exec.Command("tar", "--zstd", "-xf", archivePath, "-C", staging)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("extract restore archive: %w: %s", err, string(output))
	}
	if err := validateExtractedTree(staging); err != nil {
		return err
	}

	movedOld, err := moveExistingAside(targetRoot, rollback, stagingBase, rollbackBase)
	if err != nil {
		_ = restoreMovedEntries(rollback, targetRoot, movedOld)
		return fmt.Errorf("stage existing target contents: %w", err)
	}

	movedNew, err := moveAllEntries(staging, targetRoot)
	if err != nil {
		_ = moveNamedEntries(targetRoot, staging, movedNew)
		if rollbackErr := restoreMovedEntries(rollback, targetRoot, movedOld); rollbackErr != nil {
			return fmt.Errorf("publish restored contents: %v; rollback also failed: %w", err, rollbackErr)
		}
		return fmt.Errorf("publish restored contents: %w", err)
	}

	if err := os.RemoveAll(rollback); err != nil {
		return fmt.Errorf("remove previous target contents after successful restore: %w", err)
	}
	return nil
}

func validateExtractedTree(root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		mode := info.Mode()
		if mode&os.ModeSymlink != 0 {
			return fmt.Errorf("extracted restore tree contains symlink: %s", path)
		}
		if !mode.IsDir() && !mode.IsRegular() {
			return fmt.Errorf("extracted restore tree contains special file: %s", path)
		}
		return nil
	})
}

func moveExistingAside(root, rollback, stagingBase, rollbackBase string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	var moved []string
	for _, entry := range entries {
		name := entry.Name()
		if name == stagingBase || name == rollbackBase {
			continue
		}
		if err := os.Rename(filepath.Join(root, name), filepath.Join(rollback, name)); err != nil {
			return moved, err
		}
		moved = append(moved, name)
	}
	return moved, nil
}

func moveAllEntries(source, destination string) ([]string, error) {
	entries, err := os.ReadDir(source)
	if err != nil {
		return nil, err
	}
	var moved []string
	for _, entry := range entries {
		name := entry.Name()
		if err := os.Rename(filepath.Join(source, name), filepath.Join(destination, name)); err != nil {
			return moved, err
		}
		moved = append(moved, name)
	}
	return moved, nil
}

func moveNamedEntries(source, destination string, names []string) error {
	for i := len(names) - 1; i >= 0; i-- {
		name := names[i]
		if err := os.Rename(filepath.Join(source, name), filepath.Join(destination, name)); err != nil {
			return err
		}
	}
	return nil
}

func restoreMovedEntries(rollback, target string, names []string) error {
	return moveNamedEntries(rollback, target, names)
}
