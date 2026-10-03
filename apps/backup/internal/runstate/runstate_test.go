package runstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteAndReadOwnershipModes(t *testing.T) {
	root := filepath.Join(t.TempDir(), "state")
	run := Run{RunID: "abc", Command: "create", StartedAt: "2026-10-03T00:00:00Z", Status: StatusRunning}
	if err := Write(root, run); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(root, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode=%o", info.Mode().Perm())
	}
	data, err := os.ReadFile(filepath.Join(root, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var got Run
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if got.RunID != "abc" {
		t.Fatalf("runId=%q", got.RunID)
	}
}

func TestLockRejectsConcurrentAcquire(t *testing.T) {
	root := filepath.Join(t.TempDir(), "state")
	first, err := Acquire(root)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	if second, err := Acquire(root); err == nil {
		second.Close()
		t.Fatal("expected concurrent lock rejection")
	}
}

func TestAtomicWriteReplacesWithoutTempArtifact(t *testing.T) {
	root := filepath.Join(t.TempDir(), "state")
	if err := Ensure(root); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "current.json")
	if err := atomicWrite(path, []byte("{\"runId\":\"first\"}\n")); err != nil {
		t.Fatal(err)
	}
	if err := atomicWrite(path, []byte("{\"runId\":\"second\"}\n")); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "{\"runId\":\"second\"}\n" {
		t.Fatalf("unexpected content: %q", data)
	}
	matches, err := filepath.Glob(path + ".tmp-*")
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary files left behind: %v", matches)
	}
}
