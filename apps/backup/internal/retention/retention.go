package retention

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/repository"
	"github.com/sensorsphere/sensorsphere/apps/backup/internal/verify"
)

type Policy struct {
	Daily   int
	Weekly  int
	Monthly int
}

type Decision struct {
	BackupID string `json:"backupId"`
	Path     string `json:"path"`
	Action   string `json:"action"`
	Reason   string `json:"reason"`
}

type candidate struct {
	entry repository.Entry
	time  time.Time
}

func Plan(root string, policy Policy) ([]Decision, error) {
	entries, err := repository.List(root, false)
	if err != nil {
		return nil, err
	}
	var valid []candidate
	var invalid []repository.Entry
	for _, entry := range entries {
		result, err := verify.Bundle(entry.Path, true)
		if err != nil {
			invalid = append(invalid, entry)
			continue
		}
		t, err := time.Parse(time.RFC3339Nano, result.Manifest.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("parse backup %s createdAt: %w", entry.ID, err)
		}
		valid = append(valid, candidate{entry: entry, time: t.UTC()})
	}
	sort.Slice(valid, func(i, j int) bool { return valid[i].time.After(valid[j].time) })

	keep := map[string]string{}
	if len(valid) > 0 {
		keep[valid[0].entry.ID] = "newest verified"
	}

	keepBuckets := func(limit int, key func(time.Time) string, reason string) {
		if limit <= 0 {
			return
		}
		seen := map[string]bool{}
		count := 0
		for _, item := range valid {
			bucket := key(item.time)
			if seen[bucket] {
				continue
			}
			seen[bucket] = true
			if count < limit {
				if _, exists := keep[item.entry.ID]; !exists {
					keep[item.entry.ID] = reason
				}
				count++
			}
		}
	}

	keepBuckets(policy.Daily, func(t time.Time) string { return t.Format("2006-01-02") }, "daily retention")
	keepBuckets(policy.Weekly, func(t time.Time) string {
		y, w := t.ISOWeek()
		return fmt.Sprintf("%04d-W%02d", y, w)
	}, "weekly retention")
	keepBuckets(policy.Monthly, func(t time.Time) string { return t.Format("2006-01") }, "monthly retention")

	var decisions []Decision
	for _, item := range valid {
		if reason, ok := keep[item.entry.ID]; ok {
			decisions = append(decisions, Decision{BackupID: item.entry.ID, Path: item.entry.Path, Action: "KEEP", Reason: reason})
		} else {
			decisions = append(decisions, Decision{BackupID: item.entry.ID, Path: item.entry.Path, Action: "DELETE", Reason: "outside retention"})
		}
	}
	for _, entry := range invalid {
		decisions = append(decisions, Decision{BackupID: entry.ID, Path: entry.Path, Action: "IGNORE", Reason: "invalid or corrupt backup"})
	}
	return decisions, nil
}

func Apply(decisions []Decision) error {
	for _, decision := range decisions {
		if decision.Action != "DELETE" {
			continue
		}
		if filepath.Base(decision.Path) != decision.BackupID {
			return fmt.Errorf("refusing unsafe retention path for %s", decision.BackupID)
		}
		if err := os.RemoveAll(decision.Path); err != nil {
			return fmt.Errorf("delete backup %s: %w", decision.BackupID, err)
		}
	}
	return nil
}
