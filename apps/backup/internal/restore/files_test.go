package restore

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func makeArchive(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	source := filepath.Join(root, "source")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	for name, content := range files {
		path := filepath.Join(source, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	archivePath := filepath.Join(root, "payload.tar.zst")
	cmd := exec.Command("tar", "--zstd", "-cf", archivePath, "-C", source, ".")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create test archive: %v: %s", err, output)
	}
	return archivePath
}

func TestReplaceArchiveContentsReplacesTargetExactly(t *testing.T) {
	target := filepath.Join(t.TempDir(), "app")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "old.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	archivePath := makeArchive(t, map[string]string{
		"history-config.json": `{"restored":true}`,
		"nested/value.txt":    "new",
	})
	if err := ReplaceArchiveContents(archivePath, target); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(target, "old.txt")); !os.IsNotExist(err) {
		t.Fatalf("old target content still present: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(target, "nested", "value.txt"))
	if err != nil || string(data) != "new" {
		t.Fatalf("restored nested file mismatch data=%q err=%v", data, err)
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if len(entry.Name()) >= len(".restore-") && entry.Name()[:len(".restore-")] == ".restore-" {
			t.Fatalf("restore working directory left behind: %s", entry.Name())
		}
	}
}

func TestReplaceArchiveContentsRejectsUnsafeTarget(t *testing.T) {
	archivePath := makeArchive(t, map[string]string{"a.txt": "a"})
	for _, target := range []string{"relative", "/"} {
		if err := ReplaceArchiveContents(archivePath, target); err == nil {
			t.Fatalf("expected unsafe target rejection for %q", target)
		}
	}
}
