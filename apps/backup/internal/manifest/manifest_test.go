package manifest

import "testing"

func validManifest() Manifest {
	m := Manifest{
		BackupFormatVersion: FormatVersion,
		BackupID:            "20261003T000000Z-12345678",
		RunID:               "run",
		CreatedAt:           "2026-10-03T00:00:00Z",
		CompletedAt:         "2026-10-03T00:01:00Z",
		Tool:                Tool{Name: "sensorsphere-backup", Version: "0.1.0"},
		Source:              Source{Environment: "DEV", InstanceName: "SensorSphere [Dev]"},
		Stack:               Stack{StackVersion: "2026.10.03.1", SchemaVersion: 4, Components: map[string]Component{}},
		Database:            Database{Name: "sensorsphere", ServerMajor: 17},
		Payload:             map[string]PayloadItem{},
	}
	for _, name := range []string{"api", "frontend", "ingestion", "nginx", "migrations", "backup"} {
		m.Stack.Components[name] = Component{Version: "1", Image: "example/" + name + ":1"}
	}
	for _, name := range []string{"database", "globals", "appData", "instanceMetadata"} {
		m.Payload[name] = PayloadItem{Included: true, Path: name, Required: true}
	}
	return m
}

func TestValidateAcceptsCompleteManifest(t *testing.T) {
	if err := validManifest().Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateRejectsMissingStackComponent(t *testing.T) {
	m := validManifest()
	delete(m.Stack.Components, "nginx")
	if err := m.Validate(); err == nil {
		t.Fatal("expected missing component error")
	}
}

func TestValidateRejectsMissingRequiredPayload(t *testing.T) {
	m := validManifest()
	delete(m.Payload, "database")
	if err := m.Validate(); err == nil {
		t.Fatal("expected missing payload error")
	}
}

func TestValidateRejectsUnsupportedFormat(t *testing.T) {
	m := validManifest()
	m.BackupFormatVersion = FormatVersion + 1
	if err := m.Validate(); err == nil {
		t.Fatal("expected unsupported format error")
	}
}

func TestValidateRejectsIncompleteComponentMetadata(t *testing.T) {
	m := validManifest()
	m.Stack.Components["api"] = Component{Version: "1"}
	if err := m.Validate(); err == nil {
		t.Fatal("expected incomplete component metadata error")
	}
}

func TestValidateRejectsRequiredPayloadWithoutPath(t *testing.T) {
	m := validManifest()
	m.Payload["database"] = PayloadItem{Included: true, Required: true}
	if err := m.Validate(); err == nil {
		t.Fatal("expected payload path error")
	}
}
