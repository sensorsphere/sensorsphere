package runstate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

type Status string

const (
	StatusStarting Status = "STARTING"
	StatusRunning  Status = "RUNNING"
	StatusSuccess  Status = "SUCCESS"
	StatusFailed   Status = "FAILED"
)

type Run struct {
	RunID        string         `json:"runId"`
	Command      string         `json:"command"`
	StartedAt    string         `json:"startedAt"`
	CompletedAt  string         `json:"completedAt,omitempty"`
	Status       Status         `json:"status"`
	Phase        string         `json:"phase,omitempty"`
	BackupID     string         `json:"backupId,omitempty"`
	ErrorCode    int            `json:"errorCode,omitempty"`
	ErrorMessage string         `json:"errorMessage,omitempty"`
	Details      map[string]any `json:"details,omitempty"`
}

type Lock struct {
	file *os.File
}

func Ensure(root string) error {
	for _, dir := range []string{
		root,
		filepath.Join(root, "runs"),
		filepath.Join(root, "logs"),
		filepath.Join(root, "locks"),
	} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("create state directory %s: %w", dir, err)
		}
		if err := os.Chmod(dir, 0o700); err != nil {
			return fmt.Errorf("chmod state directory %s: %w", dir, err)
		}
	}
	return nil
}

func Acquire(root string) (*Lock, error) {
	if err := Ensure(root); err != nil {
		return nil, err
	}
	path := filepath.Join(root, "locks", "instance.lock")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open instance lock: %w", err)
	}
	if dirInfo, err := os.Stat(filepath.Dir(path)); err == nil {
		if stat, ok := dirInfo.Sys().(*syscall.Stat_t); ok {
			if err := file.Chown(int(stat.Uid), int(stat.Gid)); err != nil {
				file.Close()
				return nil, fmt.Errorf("chown instance lock: %w", err)
			}
		}
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		file.Close()
		return nil, fmt.Errorf("another mutating backup operation is already running")
	}
	return &Lock{file: file}, nil
}

func (l *Lock) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	return l.file.Close()
}

func Write(root string, run Run) error {
	if err := Ensure(root); err != nil {
		return err
	}
	data, err := json.MarshalIndent(run, "", "  ")
	if err != nil {
		return fmt.Errorf("encode run state: %w", err)
	}
	data = append(data, '\n')
	if err := atomicWrite(filepath.Join(root, "current.json"), data); err != nil {
		return err
	}
	if run.RunID != "" {
		if err := atomicWrite(filepath.Join(root, "runs", run.RunID+".json"), data); err != nil {
			return err
		}
	}
	return nil
}

func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp-" + fmt.Sprint(time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write state temp file: %w", err)
	}
	if dirInfo, err := os.Stat(filepath.Dir(path)); err == nil {
		if stat, ok := dirInfo.Sys().(*syscall.Stat_t); ok {
			if err := os.Chown(tmp, int(stat.Uid), int(stat.Gid)); err != nil {
				_ = os.Remove(tmp)
				return fmt.Errorf("chown state temp file: %w", err)
			}
		}
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("publish state file: %w", err)
	}
	return nil
}
