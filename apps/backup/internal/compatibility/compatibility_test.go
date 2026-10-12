package compatibility

import (
	"testing"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
)

func sourceManifest() manifest.Manifest {
	return manifest.Manifest{
		Stack: manifest.Stack{StackVersion: "2026.10.06.3"},
		Database: manifest.Database{
			ServerMajor:      17,
			TimescaleVersion: "2.21.3",
			MigrationLevel:   87,
		},
	}
}

func TestEvaluateCompatible(t *testing.T) {
	got := Evaluate(sourceManifest(), Target{
		StackVersion:              "2026.10.07.1",
		PostgresMajor:             17,
		TimescaleVersion:          "2.21.3",
		DatabaseMinMigrationLevel: 72,
		DatabaseMaxMigrationLevel: 87,
	})
	if !got.Compatible {
		t.Fatalf("expected compatible, got %#v", got)
	}
}

func TestEvaluateRejectsPostgresMismatch(t *testing.T) {
	got := Evaluate(sourceManifest(), Target{
		StackVersion:              "2026.10.07.1",
		PostgresMajor:             16,
		TimescaleVersion:          "2.21.3",
		DatabaseMinMigrationLevel: 72,
		DatabaseMaxMigrationLevel: 87,
	})
	if got.Compatible {
		t.Fatalf("expected incompatible")
	}
}

func TestEvaluateRejectsTooNewSourceMigration(t *testing.T) {
	got := Evaluate(sourceManifest(), Target{
		StackVersion:              "2026.10.07.1",
		PostgresMajor:             17,
		TimescaleVersion:          "2.21.3",
		DatabaseMinMigrationLevel: 72,
		DatabaseMaxMigrationLevel: 86,
	})
	if got.Compatible {
		t.Fatalf("expected incompatible")
	}
}

func TestEvaluateRejectsOlderTargetStack(t *testing.T) {
	got := Evaluate(sourceManifest(), Target{
		StackVersion:              "2026.10.05.1",
		PostgresMajor:             17,
		TimescaleVersion:          "2.21.3",
		DatabaseMinMigrationLevel: 72,
		DatabaseMaxMigrationLevel: 87,
	})
	if got.Compatible {
		t.Fatalf("expected incompatible")
	}
}

func TestEvaluateRejectsTimescaleMismatch(t *testing.T) {
	got := Evaluate(sourceManifest(), Target{
		StackVersion:              "2026.10.07.1",
		PostgresMajor:             17,
		TimescaleVersion:          "2.20.0",
		DatabaseMinMigrationLevel: 72,
		DatabaseMaxMigrationLevel: 87,
	})
	if got.Compatible {
		t.Fatalf("expected incompatible TimescaleDB version")
	}
}
