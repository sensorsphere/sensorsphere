package main

import (
	"os"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/cli"
)

var (
	version  = "dev"
	revision = "unknown"
)

func main() {
	os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr, cli.BuildInfo{
		Version:  version,
		Revision: revision,
	}))
}
