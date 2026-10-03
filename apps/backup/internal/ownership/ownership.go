package ownership

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

type Owner struct {
	UID int
	GID int
}

func FromPath(path string) (Owner, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Owner{}, fmt.Errorf("stat ownership source %s: %w", path, err)
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return Owner{}, fmt.Errorf("cannot determine ownership for %s", path)
	}
	return Owner{UID: int(stat.Uid), GID: int(stat.Gid)}, nil
}

func Apply(path string, owner Owner) error {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat ownership target %s: %w", path, err)
	}
	if err := os.Chown(path, owner.UID, owner.GID); err != nil {
		return fmt.Errorf("chown %s: %w", path, err)
	}
	return nil
}

func ApplyTree(root string, owner Owner) error {
	info, err := os.Stat(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat ownership target %s: %w", root, err)
	}
	if !info.IsDir() {
		if err := os.Chown(root, owner.UID, owner.GID); err != nil {
			return fmt.Errorf("chown %s: %w", root, err)
		}
		return nil
	}

	if err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := os.Chown(path, owner.UID, owner.GID); err != nil {
			return fmt.Errorf("chown %s: %w", path, err)
		}
		return nil
	}); err != nil {
		return fmt.Errorf("normalize ownership under %s: %w", root, err)
	}
	return nil
}
