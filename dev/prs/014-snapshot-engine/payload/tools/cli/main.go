package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const version = "0.2.0-dev"

type snapshotMetadata struct {
	Project   string    `json:"project"`
	Version   string    `json:"cliVersion"`
	CreatedAt time.Time `json:"createdAt"`
	Root      string    `json:"root"`
	FileCount int       `json:"fileCount"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "version":
		fmt.Printf("SensorSphere CLI %s\n", version)

	case "doctor":
		root, err := projectRoot()
		if err != nil {
			fail(err)
		}
		if err := doctor(root); err != nil {
			fail(err)
		}

	case "pr":
		root, err := projectRoot()
		if err != nil {
			fail(err)
		}
		if err := delegate(root, "dev/tools/pr", os.Args[2:]); err != nil {
			fail(err)
		}

	case "db":
		root, err := projectRoot()
		if err != nil {
			fail(err)
		}
		if err := delegate(root, "dev/tools/db", os.Args[2:]); err != nil {
			fail(err)
		}

	case "snapshot":
		root, err := projectRoot()
		if err != nil {
			fail(err)
		}
		if err := snapshotCommand(root, os.Args[2:]); err != nil {
			fail(err)
		}

	case "help", "--help", "-h":
		usage()

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", os.Args[1])
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Println(`SensorSphere CLI

Usage:
  sensorsphere version
  sensorsphere doctor
  sensorsphere pr <args...>
  sensorsphere db <args...>
  sensorsphere snapshot create [output-directory]
  sensorsphere snapshot inspect <archive.tar.gz>`)
}

func snapshotCommand(root string, args []string) error {
	if len(args) < 1 {
		return errors.New("snapshot subcommand is required")
	}

	switch args[0] {
	case "create":
		outputDir := "."
		if len(args) >= 2 {
			outputDir = args[1]
		}
		return createSnapshot(root, outputDir)

	case "inspect":
		if len(args) != 2 {
			return errors.New("usage: sensorsphere snapshot inspect <archive.tar.gz>")
		}
		return inspectSnapshot(args[1])

	default:
		return fmt.Errorf("unknown snapshot command: %s", args[0])
	}
}

func createSnapshot(root, outputDir string) error {
	outputAbs, err := filepath.Abs(outputDir)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(outputAbs, 0o755); err != nil {
		return err
	}

	timestamp := time.Now().UTC()
	filename := fmt.Sprintf(
		"sensorsphere-snapshot-%s.tar.gz",
		timestamp.Format("20060102T150405Z"),
	)
	archivePath := filepath.Join(outputAbs, filename)

	files, err := collectSnapshotFiles(root)
	if err != nil {
		return err
	}

	checksums := map[string]string{}

	for _, rel := range files {
		sum, err := fileSHA256(filepath.Join(root, rel))
		if err != nil {
			return err
		}
		checksums[rel] = sum
	}

	metadata := snapshotMetadata{
		Project:   "SensorSphere",
		Version:   version,
		CreatedAt: timestamp,
		Root:      root,
		FileCount: len(files),
	}

	out, err := os.Create(archivePath)
	if err != nil {
		return err
	}
	defer out.Close()

	gz := gzip.NewWriter(out)
	defer gz.Close()

	tw := tar.NewWriter(gz)
	defer tw.Close()

	if err := addJSONToTar(
		tw,
		"sensorsphere-snapshot/metadata.json",
		metadata,
	); err != nil {
		return err
	}

	if err := addJSONToTar(
		tw,
		"sensorsphere-snapshot/checksums.json",
		checksums,
	); err != nil {
		return err
	}

	for _, rel := range files {
		source := filepath.Join(root, rel)
		target := filepath.ToSlash(
			filepath.Join("sensorsphere-snapshot/repository", rel),
		)

		if err := addFileToTar(tw, source, target); err != nil {
			return err
		}
	}

	fmt.Printf("Snapshot created: %s\n", archivePath)
	fmt.Printf("Files included : %d\n", len(files))

	return nil
}

func inspectSnapshot(archivePath string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gz, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)

	var metadata snapshotMetadata
	var checksumCount int
	var repositoryFiles int

	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}

		switch header.Name {
		case "sensorsphere-snapshot/metadata.json":
			if err := json.NewDecoder(tr).Decode(&metadata); err != nil {
				return err
			}

		case "sensorsphere-snapshot/checksums.json":
			var checks map[string]string
			if err := json.NewDecoder(tr).Decode(&checks); err != nil {
				return err
			}
			checksumCount = len(checks)

		default:
			if strings.HasPrefix(
				header.Name,
				"sensorsphere-snapshot/repository/",
			) && header.Typeflag == tar.TypeReg {
				repositoryFiles++
			}
		}
	}

	if metadata.Project == "" {
		return errors.New("invalid snapshot: metadata.json not found")
	}

	fmt.Println("SensorSphere Snapshot")
	fmt.Println()
	fmt.Printf("Project      : %s\n", metadata.Project)
	fmt.Printf("CLI version  : %s\n", metadata.Version)
	fmt.Printf("Created at   : %s\n", metadata.CreatedAt.Format(time.RFC3339))
	fmt.Printf("Source root  : %s\n", metadata.Root)
	fmt.Printf("Files        : %d\n", repositoryFiles)
	fmt.Printf("Checksums    : %d\n", checksumCount)

	if repositoryFiles != metadata.FileCount {
		return fmt.Errorf(
			"snapshot file count mismatch: metadata=%d archive=%d",
			metadata.FileCount,
			repositoryFiles,
		)
	}

	if checksumCount != repositoryFiles {
		return fmt.Errorf(
			"snapshot checksum count mismatch: checksums=%d files=%d",
			checksumCount,
			repositoryFiles,
		)
	}

	fmt.Println()
	fmt.Println("Status       : VALID")
	return nil
}

func collectSnapshotFiles(root string) ([]string, error) {
	var files []string

	err := filepath.WalkDir(
		root,
		func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}

			if rel == "." {
				return nil
			}

			rel = filepath.Clean(rel)

			if shouldExclude(rel, entry.IsDir()) {
				if entry.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			if entry.Type().IsRegular() {
				files = append(files, rel)
			}

			return nil
		},
	)
	if err != nil {
		return nil, err
	}

	sort.Strings(files)
	return files, nil
}

func shouldExclude(rel string, isDir bool) bool {
	slash := filepath.ToSlash(rel)
	base := filepath.Base(rel)

	if base == ".env" || strings.HasPrefix(base, ".env.") {
		return true
	}

	excludedDirs := []string{
		".git",
		"node_modules",
		"dist",
		"coverage",
		".vite",
		"infrastructure/timescaledb/data",
		"infrastructure/mosquitto/data",
		"infrastructure/mosquitto/log",
		"dev/bin",
	}

	for _, excluded := range excludedDirs {
		if slash == excluded || strings.HasPrefix(slash, excluded+"/") {
			return true
		}
	}

	if strings.Contains(slash, "/.backup/") ||
		strings.HasSuffix(slash, "/.backup") {
		return true
	}

	if strings.HasSuffix(base, ".tar.gz") ||
		strings.HasSuffix(base, ".tgz") {
		return true
	}

	return false
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

func addJSONToTar(
	tw *tar.Writer,
	name string,
	value any,
) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	header := &tar.Header{
		Name:    name,
		Mode:    0o644,
		Size:    int64(len(data)),
		ModTime: time.Now(),
	}

	if err := tw.WriteHeader(header); err != nil {
		return err
	}

	_, err = tw.Write(data)
	return err
}

func addFileToTar(
	tw *tar.Writer,
	source string,
	target string,
) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}

	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}

	header.Name = target

	if err := tw.WriteHeader(header); err != nil {
		return err
	}

	file, err := os.Open(source)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(tw, file)
	return err
}

func projectRoot() (string, error) {
	if configured := os.Getenv("SENSORSPHERE_ROOT"); configured != "" {
		if validRoot(configured) {
			return filepath.Abs(configured)
		}
		return "", fmt.Errorf(
			"SENSORSPHERE_ROOT is not a SensorSphere project: %s",
			configured,
		)
	}

	if executable, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(executable); err == nil {
			candidate := filepath.Clean(
				filepath.Join(filepath.Dir(resolved), "..", ".."),
			)
			if validRoot(candidate) {
				return candidate, nil
			}
		}
	}

	current, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for {
		if validRoot(current) {
			return current, nil
		}

		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}

	return "", errors.New(
		"SensorSphere project root not found; set SENSORSPHERE_ROOT",
	)
}

func validRoot(path string) bool {
	for _, item := range []string{
		"docker-compose.yml",
		"apps",
		"packages",
		"dev/tools",
	} {
		if _, err := os.Stat(filepath.Join(path, item)); err != nil {
			return false
		}
	}
	return true
}

func delegate(root, relativeTool string, args []string) error {
	tool := filepath.Join(root, relativeTool)

	if _, err := os.Stat(tool); err != nil {
		return fmt.Errorf("required tool is missing: %s", tool)
	}

	command := exec.Command(tool, args...)
	command.Dir = root
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.Env = os.Environ()

	return command.Run()
}

func doctor(root string) error {
	fmt.Println("SensorSphere Doctor")
	fmt.Println()

	checks := []struct {
		name string
		run  func() error
	}{
		{
			"Project root",
			func() error {
				if !validRoot(root) {
					return errors.New("invalid project root")
				}
				return nil
			},
		},
		{
			"Docker Compose configuration",
			func() error {
				return runQuiet(root, "docker", "compose", "config")
			},
		},
		{
			"Docker Compose services",
			func() error {
				return runQuiet(root, "docker", "compose", "ps")
			},
		},
		{
			"Database migrations",
			func() error {
				return runQuiet(
					root,
					filepath.Join(root, "dev/tools/db"),
					"status",
				)
			},
		},
	}

	baseURL := strings.TrimRight(
		envOrDefault(
			"SENSORSPHERE_BASE_URL",
			"http://127.0.0.1:8080",
		),
		"/",
	)

	httpChecks := []struct {
		name string
		path string
	}{
		{"API health", "/api/health"},
		{"Sensor catalog", "/api/v1/sensors"},
		{"Latest telemetry", "/api/v1/measurements/latest"},
	}

	failed := false

	for _, check := range checks {
		if err := check.run(); err != nil {
			fmt.Printf("[FAIL] %-32s %v\n", check.name, err)
			failed = true
		} else {
			fmt.Printf("[ OK ] %s\n", check.name)
		}
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	for _, check := range httpChecks {
		if err := httpGet(client, baseURL+check.path); err != nil {
			fmt.Printf("[FAIL] %-32s %v\n", check.name, err)
			failed = true
		} else {
			fmt.Printf("[ OK ] %s\n", check.name)
		}
	}

	fmt.Println()
	fmt.Printf("Project: %s\n", root)
	fmt.Printf("API    : %s\n", baseURL)

	if failed {
		return errors.New("one or more doctor checks failed")
	}

	fmt.Println()
	fmt.Println("Status : READY")
	return nil
}

func runQuiet(root, name string, args ...string) error {
	command := exec.Command(name, args...)
	command.Dir = root
	command.Env = os.Environ()

	output, err := command.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return errors.New(message)
	}
	return nil
}

func httpGet(client *http.Client, url string) error {
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", response.StatusCode)
	}
	return nil
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func fail(err error) {
	fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
	os.Exit(1)
}
