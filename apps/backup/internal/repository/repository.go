package repository

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Paths struct {
	ID         string
	Incomplete string
	Final      string
}

type Entry struct {
	ID         string    `json:"id"`
	Path       string    `json:"path"`
	Complete   bool      `json:"complete"`
	ModifiedAt time.Time `json:"modifiedAt"`
	SizeBytes  int64     `json:"sizeBytes"`
}

func Ensure(root string) error {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return fmt.Errorf("create backup root: %w", err)
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return fmt.Errorf("chmod backup root: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".incomplete"), 0o700); err != nil {
		return fmt.Errorf("create incomplete root: %w", err)
	}
	return nil
}

func NewID(now time.Time) (string, error) {
	var random [4]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", fmt.Errorf("generate backup id: %w", err)
	}
	return now.UTC().Format("20060102T150405Z") + "-" + hex.EncodeToString(random[:]), nil
}

func Begin(root string, now time.Time) (Paths, error) {
	if err := Ensure(root); err != nil {
		return Paths{}, err
	}
	id, err := NewID(now)
	if err != nil {
		return Paths{}, err
	}
	paths := Paths{
		ID:         id,
		Incomplete: filepath.Join(root, ".incomplete", id),
		Final:      filepath.Join(root, id),
	}
	if _, err := os.Stat(paths.Final); !os.IsNotExist(err) {
		return Paths{}, fmt.Errorf("backup already exists: %s", id)
	}
	if err := os.MkdirAll(paths.Incomplete, 0o700); err != nil {
		return Paths{}, fmt.Errorf("create incomplete backup: %w", err)
	}
	return paths, nil
}

func Publish(paths Paths, completedAt time.Time) error {
	content := fmt.Sprintf("backupId=%s\ncompletedAt=%s\nformatVersion=1\n",
		paths.ID, completedAt.UTC().Format(time.RFC3339Nano))
	if err := os.WriteFile(filepath.Join(paths.Incomplete, "COMPLETE"), []byte(content), 0o600); err != nil {
		return fmt.Errorf("write COMPLETE marker: %w", err)
	}
	if err := os.Rename(paths.Incomplete, paths.Final); err != nil {
		return fmt.Errorf("publish backup: %w", err)
	}
	return nil
}

func List(root string, includeIncomplete bool) ([]Entry, error) {
	if err := Ensure(root); err != nil {
		return nil, err
	}
	var result []Entry
	addDir := func(path, id string, complete bool) error {
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		size, err := DirSize(path)
		if err != nil {
			return err
		}
		result = append(result, Entry{
			ID: id, Path: path, Complete: complete,
			ModifiedAt: info.ModTime().UTC(), SizeBytes: size,
		})
		return nil
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("read backup root: %w", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		path := filepath.Join(root, entry.Name())
		if IsComplete(path) {
			if err := addDir(path, entry.Name(), true); err != nil {
				return nil, err
			}
		}
	}
	if includeIncomplete {
		incompleteRoot := filepath.Join(root, ".incomplete")
		entries, err := os.ReadDir(incompleteRoot)
		if err != nil && !os.IsNotExist(err) {
			return nil, fmt.Errorf("read incomplete backup root: %w", err)
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			if err := addDir(filepath.Join(incompleteRoot, entry.Name()), entry.Name(), false); err != nil {
				return nil, err
			}
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ID == result[j].ID {
			return result[i].Complete && !result[j].Complete
		}
		return result[i].ID > result[j].ID
	})
	return result, nil
}

func Resolve(root, id string) (string, error) {
	if id != "latest" {
		if id == "" || id == "." || id == ".." || strings.Contains(id, "/") || strings.Contains(id, "\\") {
			return "", fmt.Errorf("invalid backup id")
		}
		path := filepath.Join(root, id)
		if !IsComplete(path) {
			return "", fmt.Errorf("backup not found or incomplete: %s", id)
		}
		return path, nil
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return "", fmt.Errorf("read backup root: %w", err)
	}
	var ids []string
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if IsComplete(filepath.Join(root, entry.Name())) {
			ids = append(ids, entry.Name())
		}
	}
	if len(ids) == 0 {
		return "", fmt.Errorf("no complete backups found")
	}
	sort.Strings(ids)
	return filepath.Join(root, ids[len(ids)-1]), nil
}

func IsComplete(path string) bool {
	info, err := os.Stat(filepath.Join(path, "COMPLETE"))
	return err == nil && !info.IsDir()
}

func DirSize(root string) (int64, error) {
	var total int64
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			total += info.Size()
		}
		return nil
	})
	return total, err
}
