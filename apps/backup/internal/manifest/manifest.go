package manifest

import (
	"encoding/json"
	"fmt"
	"os"
)

const FormatVersion = 1

type Tool struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Revision string `json:"revision"`
}

type Source struct {
	Host           string `json:"host,omitempty"`
	InstallDir     string `json:"installDir,omitempty"`
	ComposeProject string `json:"composeProject,omitempty"`
	Environment    string `json:"environment"`
	InstanceName   string `json:"instanceName"`
}

type Component struct {
	Version string `json:"version,omitempty"`
	Image   string `json:"image,omitempty"`
}

type Stack struct {
	StackVersion  string               `json:"stackVersion,omitempty"`
	SchemaVersion int                  `json:"schemaVersion,omitempty"`
	Components    map[string]Component `json:"components"`
}

type Database struct {
	Name             string `json:"name"`
	ServerVersion    string `json:"serverVersion"`
	ServerMajor      int    `json:"serverMajor"`
	TimescaleVersion string `json:"timescaleVersion,omitempty"`
	MigrationLevel   int    `json:"migrationLevel"`
	SourceSizeBytes  int64  `json:"sourceSizeBytes"`
	DumpSizeBytes    int64  `json:"dumpSizeBytes"`
}

type PayloadItem struct {
	Included  bool   `json:"included"`
	Path      string `json:"path,omitempty"`
	SizeBytes int64  `json:"sizeBytes,omitempty"`
	Required  bool   `json:"required"`
}

type Verification struct {
	Status            string `json:"status"`
	VerifiedAt        string `json:"verifiedAt,omitempty"`
	ChecksumStatus    string `json:"checksumStatus"`
	DumpCatalogStatus string `json:"dumpCatalogStatus"`
	ArchiveStatus     string `json:"archiveStatus"`
}

type Manifest struct {
	BackupFormatVersion int                    `json:"backupFormatVersion"`
	BackupID            string                 `json:"backupId"`
	RunID               string                 `json:"runId"`
	Label               string                 `json:"label,omitempty"`
	CreatedAt           string                 `json:"createdAt"`
	CompletedAt         string                 `json:"completedAt"`
	Tool                Tool                   `json:"tool"`
	Source              Source                 `json:"source"`
	Stack               Stack                  `json:"stack"`
	Database            Database               `json:"database"`
	Payload             map[string]PayloadItem `json:"payload"`
	InstanceSecrets     struct {
		Included bool `json:"included"`
	} `json:"instanceSecrets"`
	Verification Verification `json:"verification"`
}

func (m Manifest) Validate() error {
	if m.BackupFormatVersion != FormatVersion {
		return fmt.Errorf("unsupported backup format version: %d", m.BackupFormatVersion)
	}
	if m.BackupID == "" || m.RunID == "" {
		return fmt.Errorf("backupId and runId are required")
	}
	if m.CreatedAt == "" || m.CompletedAt == "" {
		return fmt.Errorf("createdAt and completedAt are required")
	}
	if m.Tool.Name == "" || m.Tool.Version == "" {
		return fmt.Errorf("tool metadata is incomplete")
	}
	if m.Stack.StackVersion == "" || m.Stack.SchemaVersion <= 0 {
		return fmt.Errorf("stack metadata is incomplete")
	}
	for _, key := range []string{"api", "frontend", "ingestion", "nginx", "migrations", "backup"} {
		component, ok := m.Stack.Components[key]
		if !ok || component.Version == "" || component.Image == "" {
			return fmt.Errorf("stack component metadata is incomplete: %s", key)
		}
	}
	if m.Database.Name == "" || m.Database.ServerMajor <= 0 {
		return fmt.Errorf("database metadata is incomplete")
	}
	for _, key := range []string{"database", "globals", "appData", "instanceMetadata"} {
		item, ok := m.Payload[key]
		if !ok || !item.Included || item.Path == "" {
			return fmt.Errorf("required payload missing: %s", key)
		}
	}
	return nil
}

func Write(path string, m Manifest) error {
	if err := m.Validate(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}
	return nil
}

func Read(path string) (Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("read manifest: %w", err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest: %w", err)
	}
	if err := m.Validate(); err != nil {
		return Manifest{}, err
	}
	return m, nil
}
