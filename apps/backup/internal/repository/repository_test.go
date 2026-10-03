package repository

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestListHidesIncompleteByDefault(t *testing.T) {
	root := t.TempDir()
	if err := Ensure(root); err != nil {
		t.Fatal(err)
	}
	complete := filepath.Join(root, "20261003T000000Z-aaaaaaaa")
	if err := os.MkdirAll(complete, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(complete, "COMPLETE"), []byte("ok"), 0o600); err != nil {
		t.Fatal(err)
	}
	incomplete := filepath.Join(root, ".incomplete", "20261003T000100Z-bbbbbbbb")
	if err := os.MkdirAll(incomplete, 0o700); err != nil {
		t.Fatal(err)
	}

	entries, err := List(root, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || !entries[0].Complete {
		t.Fatalf("entries=%#v", entries)
	}

	entries, err = List(root, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("entries=%#v", entries)
	}
}

func TestBeginAndPublish(t *testing.T) {
	root := t.TempDir()
	paths, err := Begin(root, time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(paths.Incomplete); err != nil {
		t.Fatal(err)
	}
	if IsComplete(paths.Final) {
		t.Fatal("final unexpectedly complete")
	}
	if err := Publish(paths, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	if !IsComplete(paths.Final) {
		t.Fatal("published backup not complete")
	}
}

func TestResolveLatestIgnoresIncomplete(t *testing.T) {
	root := t.TempDir()
	if err := Ensure(root); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{
		"20261003T000000Z-aaaaaaaa",
		"20261003T010000Z-bbbbbbbb",
	} {
		path := filepath.Join(root, id)
		if err := os.MkdirAll(path, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(path, "COMPLETE"), []byte("ok"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	incompleteID := "20261003T020000Z-cccccccc"
	if err := os.MkdirAll(filepath.Join(root, ".incomplete", incompleteID), 0o700); err != nil {
		t.Fatal(err)
	}
	path, err := Resolve(root, "latest")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "20261003T010000Z-bbbbbbbb" {
		t.Fatalf("unexpected latest: %s", path)
	}
	if _, err := Resolve(root, incompleteID); err == nil {
		t.Fatal("expected incomplete backup rejection")
	}
}

func TestResolveRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if err := Ensure(root); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"..", "../escape", "nested/escape", "nested\\escape"} {
		if _, err := Resolve(root, id); err == nil {
			t.Fatalf("expected invalid backup id rejection for %q", id)
		}
	}
}
