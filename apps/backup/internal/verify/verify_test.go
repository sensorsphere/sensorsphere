package verify

import "testing"

func TestSafeRelativeRejectsTraversal(t *testing.T) {
	for _, path := range []string{
		"",
		"..",
		"../secret",
		"nested/../../secret",
		"/etc/passwd",
	} {
		if safeRelative(path) {
			t.Fatalf("expected unsafe path: %q", path)
		}
	}
}

func TestSafeRelativeAcceptsBundlePaths(t *testing.T) {
	for _, path := range []string{
		"database/database.dump",
		"app/app-data.tar.zst",
		"instance/installation.json",
	} {
		if !safeRelative(path) {
			t.Fatalf("expected safe path: %q", path)
		}
	}
}
