package database

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Host     string
	Port     int
	Name     string
	User     string
	Password string
}

type Metadata struct {
	ServerVersion    string
	ServerMajor      int
	TimescaleVersion string
	MigrationLevel   int
	SourceSizeBytes  int64
}

func env(cfg Config) []string {
	result := append([]string{}, os.Environ()...)
	result = append(result, "PGPASSWORD="+cfg.Password)
	return result
}

func baseArgs(cfg Config) []string {
	return []string{
		"-h", cfg.Host,
		"-p", strconv.Itoa(cfg.Port),
		"-U", cfg.User,
		"-d", cfg.Name,
	}
}

func Query(cfg Config, sql string) (string, error) {
	args := append(baseArgs(cfg), "-At", "-v", "ON_ERROR_STOP=1", "-c", sql)
	cmd := exec.Command("psql", args...)
	cmd.Env = env(cfg)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("database query failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

func ReadMetadata(cfg Config) (Metadata, error) {
	serverVersion, err := Query(cfg, "SHOW server_version;")
	if err != nil {
		return Metadata{}, err
	}
	serverNumText, err := Query(cfg, "SHOW server_version_num;")
	if err != nil {
		return Metadata{}, err
	}
	serverNum, err := strconv.Atoi(strings.TrimSpace(serverNumText))
	if err != nil {
		return Metadata{}, fmt.Errorf("parse PostgreSQL server_version_num: %w", err)
	}
	timescaleVersion, err := Query(cfg, "SELECT COALESCE((SELECT extversion FROM pg_extension WHERE extname='timescaledb'),'');")
	if err != nil {
		return Metadata{}, err
	}
	migrationText, err := Query(cfg, "SELECT COALESCE(MAX(version),0) FROM schema_migrations;")
	if err != nil {
		return Metadata{}, err
	}
	migrationLevel, err := strconv.Atoi(strings.TrimSpace(migrationText))
	if err != nil {
		return Metadata{}, fmt.Errorf("parse migration level: %w", err)
	}
	sizeText, err := Query(cfg, "SELECT pg_database_size(current_database());")
	if err != nil {
		return Metadata{}, err
	}
	sizeBytes, err := strconv.ParseInt(strings.TrimSpace(sizeText), 10, 64)
	if err != nil {
		return Metadata{}, fmt.Errorf("parse database size: %w", err)
	}

	return Metadata{
		ServerVersion:    serverVersion,
		ServerMajor:      serverNum / 10000,
		TimescaleVersion: timescaleVersion,
		MigrationLevel:   migrationLevel,
		SourceSizeBytes:  sizeBytes,
	}, nil
}

func Dump(cfg Config, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return fmt.Errorf("create dump directory: %w", err)
	}
	args := append(baseArgs(cfg), "-Fc", "-f", destination)
	cmd := exec.Command("pg_dump", args...)
	cmd.Env = env(cfg)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pg_dump failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	if err := os.Chmod(destination, 0o600); err != nil {
		return fmt.Errorf("chmod database dump: %w", err)
	}
	return VerifyDump(destination)
}

func DumpGlobals(cfg Config, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return fmt.Errorf("create globals directory: %w", err)
	}
	args := []string{
		"-h", cfg.Host,
		"-p", strconv.Itoa(cfg.Port),
		"-U", cfg.User,
		"--globals-only",
		"--no-role-passwords",
		"-f", destination,
	}
	cmd := exec.Command("pg_dumpall", args...)
	cmd.Env = env(cfg)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pg_dumpall failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	if err := os.Chmod(destination, 0o600); err != nil {
		return fmt.Errorf("chmod globals dump: %w", err)
	}
	return nil
}

func VerifyDump(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat database dump: %w", err)
	}
	if info.Size() == 0 {
		return fmt.Errorf("database dump is empty")
	}
	cmd := exec.Command("pg_restore", "--list", path)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("database dump catalog unreadable: %w: %s", err, string(output))
	}
	return nil
}
