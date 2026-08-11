package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const version = "0.2.0-dev"

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
  sensorsphere db <args...>`)
}

func projectRoot() (string, error) {
	if configured := os.Getenv("SENSORSPHERE_ROOT"); configured != "" {
		if validRoot(configured) {
			return filepath.Abs(configured)
		}
		return "", fmt.Errorf("SENSORSPHERE_ROOT is not a SensorSphere project: %s", configured)
	}

	if executable, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(executable); err == nil {
			candidate := filepath.Clean(filepath.Join(filepath.Dir(resolved), "..", ".."))
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

	return "", errors.New("SensorSphere project root not found; set SENSORSPHERE_ROOT")
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
				return runQuiet(root, filepath.Join(root, "dev/tools/db"), "status")
			},
		},
	}

	baseURL := strings.TrimRight(
		envOrDefault("SENSORSPHERE_BASE_URL", "http://127.0.0.1:8080"),
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

	client := &http.Client{Timeout: 5 * time.Second}

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
