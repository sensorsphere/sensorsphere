package cli

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

var testBuild = BuildInfo{
	Version:  "0.1.0",
	Revision: "test-revision",
}

func TestNoCommandShowsUsageAndReturnsTwo(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(nil, &stdout, &stderr, testBuild)

	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if stdout.Len() != 0 {
		t.Fatalf("expected empty stdout, got %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "Usage:") {
		t.Fatalf("expected usage on stderr, got %q", stderr.String())
	}
}

func TestUnknownCommandReturnsTwo(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"unknown"}, &stdout, &stderr, testBuild)

	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !strings.Contains(stderr.String(), "unknown command") {
		t.Fatalf("expected unknown command error, got %q", stderr.String())
	}
}

func TestHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"help"}, &stdout, &stderr, testBuild)

	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
	if !strings.Contains(stdout.String(), "SensorSphere Backup") {
		t.Fatalf("expected help title, got %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
}

func TestVersionHuman(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"version"}, &stdout, &stderr, testBuild)

	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
	output := stdout.String()
	for _, expected := range []string{
		"SensorSphere Backup 0.1.0",
		"Revision: test-revision",
		"Backup format: 1",
		"PostgreSQL major: 17",
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("expected %q in %q", expected, output)
		}
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
}

func TestVersionJSON(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"version", "--json"}, &stdout, &stderr, testBuild)

	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}

	var got map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
		t.Fatalf("invalid JSON: %v: %q", err, stdout.String())
	}

	if got["name"] != "sensorsphere-backup" {
		t.Fatalf("unexpected name: %#v", got["name"])
	}
	if got["version"] != "0.1.0" {
		t.Fatalf("unexpected version: %#v", got["version"])
	}
	if got["revision"] != "test-revision" {
		t.Fatalf("unexpected revision: %#v", got["revision"])
	}
	if got["backupFormatVersion"] != float64(1) {
		t.Fatalf("unexpected backup format: %#v", got["backupFormatVersion"])
	}
	if got["postgresMajor"] != float64(17) {
		t.Fatalf("unexpected postgres major: %#v", got["postgresMajor"])
	}
}

func TestUnknownVersionOptionReturnsTwo(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"version", "--wat"}, &stdout, &stderr, testBuild)

	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !strings.Contains(stderr.String(), "unknown version option") {
		t.Fatalf("expected option error, got %q", stderr.String())
	}
}

func TestHelpRejectsArguments(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"help", "extra"}, &stdout, &stderr, testBuild)

	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !strings.Contains(stderr.String(), "does not accept arguments") {
		t.Fatalf("expected help argument error, got %q", stderr.String())
	}
}
