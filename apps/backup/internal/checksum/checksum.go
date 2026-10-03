package checksum

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const FileName = "checksums.sha256"

func Generate(root string) error {
	var paths []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == FileName || rel == "COMPLETE" {
			return nil
		}
		paths = append(paths, rel)
		return nil
	})
	if err != nil {
		return fmt.Errorf("walk bundle for checksums: %w", err)
	}
	sort.Strings(paths)

	outPath := filepath.Join(root, FileName)
	file, err := os.OpenFile(outPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("create checksums file: %w", err)
	}
	defer file.Close()

	for _, rel := range paths {
		sum, err := fileSHA256(filepath.Join(root, filepath.FromSlash(rel)))
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(file, "%s  %s\n", sum, rel); err != nil {
			return fmt.Errorf("write checksum: %w", err)
		}
	}
	return file.Sync()
}

func Verify(root string) error {
	_, err := VerifyEntries(root)
	return err
}

func VerifyEntries(root string) (map[string]bool, error) {
	file, err := os.Open(filepath.Join(root, FileName))
	if err != nil {
		return nil, fmt.Errorf("open checksums file: %w", err)
	}
	defer file.Close()

	entries := map[string]bool{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) < 67 || line[64:66] != "  " {
			return nil, fmt.Errorf("invalid checksum line")
		}
		expected := line[:64]
		rel := line[66:]
		if _, err := hex.DecodeString(expected); err != nil {
			return nil, fmt.Errorf("invalid checksum hash for %s", rel)
		}
		if !safeRelative(rel) {
			return nil, fmt.Errorf("unsafe checksum path: %s", rel)
		}
		if entries[rel] {
			return nil, fmt.Errorf("duplicate checksum path: %s", rel)
		}
		actual, err := fileSHA256(filepath.Join(root, filepath.FromSlash(rel)))
		if err != nil {
			return nil, err
		}
		if actual != expected {
			return nil, fmt.Errorf("checksum mismatch: %s", rel)
		}
		entries[rel] = true
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read checksums file: %w", err)
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("checksums file is empty")
	}
	return entries, nil
}

func safeRelative(path string) bool {
	if path == "" || filepath.IsAbs(path) {
		return false
	}
	clean := filepath.Clean(filepath.FromSlash(path))
	return clean != "." && clean != ".." && !strings.HasPrefix(clean, ".."+string(filepath.Separator))
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open checksum file %s: %w", path, err)
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("hash file %s: %w", path, err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
