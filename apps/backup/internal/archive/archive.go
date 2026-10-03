package archive

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func CreateZstd(sourceDir, destination string) error {
	info, err := os.Stat(sourceDir)
	if err != nil {
		return fmt.Errorf("stat archive source %s: %w", sourceDir, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("archive source is not a directory: %s", sourceDir)
	}
	if err := validateSourceTree(sourceDir); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return fmt.Errorf("create archive destination directory: %w", err)
	}

	cmd := exec.Command("tar", "--zstd", "-cf", destination, "-C", sourceDir, ".")
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("archive %s: %w: %s", sourceDir, err, string(output))
	}
	if err := os.Chmod(destination, 0o600); err != nil {
		return fmt.Errorf("chmod archive: %w", err)
	}
	return VerifyZstd(destination)
}

func VerifyZstd(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat archive: %w", err)
	}
	if info.Size() == 0 {
		return fmt.Errorf("archive is empty: %s", path)
	}
	cmd := exec.Command("tar", "--zstd", "-tf", path)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("archive catalog unreadable %s: %w: %s", path, err, string(output))
	}
	scanner := bufio.NewScanner(bytes.NewReader(output))
	count := 0
	for scanner.Scan() {
		entry := strings.TrimSpace(scanner.Text())
		if entry == "" {
			continue
		}
		if !safeArchivePath(entry) {
			return fmt.Errorf("unsafe archive path in %s: %s", path, entry)
		}
		count++
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read archive catalog %s: %w", path, err)
	}
	if count == 0 {
		return fmt.Errorf("archive catalog is empty: %s", path)
	}
	return nil
}

func validateSourceTree(root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		mode := info.Mode()
		if mode&os.ModeSymlink != 0 {
			return fmt.Errorf("refusing symlink in archive source: %s", path)
		}
		if !mode.IsRegular() && !mode.IsDir() {
			return fmt.Errorf("refusing special file in archive source: %s", path)
		}
		return nil
	})
}

func safeArchivePath(path string) bool {
	path = strings.TrimSpace(path)
	if path == "" || strings.HasPrefix(path, "/") {
		return false
	}
	clean := filepath.Clean(filepath.FromSlash(path))
	return clean != ".." && !strings.HasPrefix(clean, ".."+string(filepath.Separator))
}
