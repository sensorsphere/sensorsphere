package compatibility

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/manifest"
)

type Target struct {
	StackVersion              string `json:"stackVersion"`
	PostgresMajor             int    `json:"postgresMajor"`
	TimescaleVersion          string `json:"timescaleVersion,omitempty"`
	DatabaseMinMigrationLevel int    `json:"databaseMinMigrationLevel"`
	DatabaseMaxMigrationLevel int    `json:"databaseMaxMigrationLevel"`
}

type Decision struct {
	Compatible bool     `json:"compatible"`
	Reasons    []string `json:"reasons"`
}

func Evaluate(source manifest.Manifest, target Target) Decision {
	var reasons []string

	if target.PostgresMajor <= 0 {
		reasons = append(reasons, "target PostgreSQL major is unknown")
	} else if source.Database.ServerMajor != target.PostgresMajor {
		reasons = append(reasons, fmt.Sprintf(
			"PostgreSQL major mismatch: source=%d target=%d",
			source.Database.ServerMajor, target.PostgresMajor,
		))
	}

	if source.Database.TimescaleVersion != "" && target.TimescaleVersion != "" &&
		source.Database.TimescaleVersion != target.TimescaleVersion {
		reasons = append(reasons, fmt.Sprintf(
			"TimescaleDB version mismatch: source=%s target=%s",
			source.Database.TimescaleVersion, target.TimescaleVersion,
		))
	}

	if target.DatabaseMinMigrationLevel <= 0 || target.DatabaseMaxMigrationLevel <= 0 ||
		target.DatabaseMinMigrationLevel > target.DatabaseMaxMigrationLevel {
		reasons = append(reasons, "target database compatibility range is invalid")
	} else if source.Database.MigrationLevel < target.DatabaseMinMigrationLevel {
		reasons = append(reasons, fmt.Sprintf(
			"source migration level %d is below target minimum %d",
			source.Database.MigrationLevel, target.DatabaseMinMigrationLevel,
		))
	} else if source.Database.MigrationLevel > target.DatabaseMaxMigrationLevel {
		reasons = append(reasons, fmt.Sprintf(
			"source migration level %d is above target maximum %d",
			source.Database.MigrationLevel, target.DatabaseMaxMigrationLevel,
		))
	}

	if source.Stack.StackVersion != "" && target.StackVersion != "" {
		if cmp, ok := compareStackVersion(target.StackVersion, source.Stack.StackVersion); ok && cmp < 0 {
			reasons = append(reasons, fmt.Sprintf(
				"target stack %s is older than source stack %s",
				target.StackVersion, source.Stack.StackVersion,
			))
		}
	}

	if len(reasons) == 0 {
		reasons = append(reasons, "source Recovery Bundle is compatible with target")
	}
	return Decision{
		Compatible: len(reasons) == 1 && reasons[0] == "source Recovery Bundle is compatible with target",
		Reasons:    reasons,
	}
}

func compareStackVersion(a, b string) (int, bool) {
	parse := func(v string) ([]int, bool) {
		parts := strings.Split(v, ".")
		if len(parts) < 4 {
			return nil, false
		}
		out := make([]int, len(parts))
		for i, p := range parts {
			n, err := strconv.Atoi(p)
			if err != nil {
				return nil, false
			}
			out[i] = n
		}
		return out, true
	}
	av, ok := parse(a)
	if !ok {
		return 0, false
	}
	bv, ok := parse(b)
	if !ok {
		return 0, false
	}
	n := len(av)
	if len(bv) > n {
		n = len(bv)
	}
	for i := 0; i < n; i++ {
		var ai, bi int
		if i < len(av) {
			ai = av[i]
		}
		if i < len(bv) {
			bi = bv[i]
		}
		if ai < bi {
			return -1, true
		}
		if ai > bi {
			return 1, true
		}
	}
	return 0, true
}
