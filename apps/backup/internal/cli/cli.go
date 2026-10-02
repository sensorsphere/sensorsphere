package cli

import (
	"encoding/json"
	"fmt"
	"io"
)

const BackupFormatVersion = 1

type BuildInfo struct {
	Version  string
	Revision string
}

type versionOutput struct {
	Name                string `json:"name"`
	Version             string `json:"version"`
	Revision            string `json:"revision"`
	BackupFormatVersion int    `json:"backupFormatVersion"`
	PostgresMajor       int    `json:"postgresMajor"`
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "SensorSphere Backup")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintln(w, "  sensorsphere-backup <command> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  version    Show backup module build information")
	fmt.Fprintln(w, "  help       Show this help")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Backup commands create/list/show/status/verify/prune are added by the next Phase 1 slices.")
}

func Run(args []string, stdout, stderr io.Writer, info BuildInfo) int {
	if len(args) == 0 {
		usage(stderr)
		return 2
	}

	switch args[0] {
	case "help", "--help", "-h":
		if len(args) != 1 {
			fmt.Fprintln(stderr, "ERROR: help does not accept arguments")
			return 2
		}
		usage(stdout)
		return 0

	case "version":
		jsonMode := false
		for _, arg := range args[1:] {
			switch arg {
			case "--json":
				jsonMode = true
			default:
				fmt.Fprintf(stderr, "ERROR: unknown version option: %s\n", arg)
				return 2
			}
		}

		result := versionOutput{
			Name:                "sensorsphere-backup",
			Version:             info.Version,
			Revision:            info.Revision,
			BackupFormatVersion: BackupFormatVersion,
			PostgresMajor:       17,
		}

		if jsonMode {
			encoder := json.NewEncoder(stdout)
			encoder.SetEscapeHTML(false)
			if err := encoder.Encode(result); err != nil {
				fmt.Fprintf(stderr, "ERROR: cannot encode version output: %v\n", err)
				return 90
			}
			return 0
		}

		fmt.Fprintf(stdout, "SensorSphere Backup %s\n", result.Version)
		fmt.Fprintf(stdout, "Revision: %s\n", result.Revision)
		fmt.Fprintf(stdout, "Backup format: %d\n", result.BackupFormatVersion)
		fmt.Fprintf(stdout, "PostgreSQL major: %d\n", result.PostgresMajor)
		return 0

	default:
		fmt.Fprintf(stderr, "ERROR: unknown command: %s\n\n", args[0])
		usage(stderr)
		return 2
	}
}
