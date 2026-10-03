package archive

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCreateAndVerifyZstd(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "data.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(root, "bundle.tar.zst")
	if err := CreateZstd(source, dest); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := VerifyZstd(dest); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestCreateRejectsSymlink(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(source, "escape")); err != nil {
		t.Fatal(err)
	}
	if err := CreateZstd(source, filepath.Join(root, "bundle.tar.zst")); err == nil {
		t.Fatal("expected symlink rejection")
	}
}

func TestSafeArchivePath(t *testing.T) {
	for _, bad := range []string{"../secret", "../../x", "/etc/passwd"} {
		if safeArchivePath(bad) {
			t.Fatalf("expected unsafe: %q", bad)
		}
	}
	for _, good := range []string{"./history-config.json", "data/mosquitto.db"} {
		if !safeArchivePath(good) {
			t.Fatalf("expected safe: %q", good)
		}
	}
}
