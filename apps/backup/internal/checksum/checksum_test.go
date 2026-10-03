package checksum

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateAndVerifyEntries(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Generate(root); err != nil {
		t.Fatal(err)
	}
	entries, err := VerifyEntries(root)
	if err != nil {
		t.Fatal(err)
	}
	if !entries["a.txt"] {
		t.Fatal("a.txt not covered")
	}
}

func TestVerifyRejectsTampering(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "a.txt")
	if err := os.WriteFile(path, []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Generate(root); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("changed"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyEntries(root); err == nil {
		t.Fatal("expected checksum mismatch")
	}
}

func TestVerifyRejectsDuplicatePath(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Generate(root); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, FileName))
	if err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(string(data))
	if err := os.WriteFile(filepath.Join(root, FileName), []byte(line+"\n"+line+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyEntries(root); err == nil {
		t.Fatal("expected duplicate rejection")
	}
}

func TestVerifyRejectsUnsafePath(t *testing.T) {
	root := t.TempDir()
	line := strings.Repeat("0", 64) + "  ../outside\n"
	if err := os.WriteFile(filepath.Join(root, FileName), []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyEntries(root); err == nil || !strings.Contains(err.Error(), "unsafe checksum path") {
		t.Fatalf("expected unsafe path rejection, got %v", err)
	}
}
