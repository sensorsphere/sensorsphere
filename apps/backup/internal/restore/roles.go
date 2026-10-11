package restore

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/sensorsphere/sensorsphere/apps/backup/internal/config"
)

type roleDefinition struct {
	Name       string
	Attributes []string
}

var (
	createRolePattern = regexp.MustCompile(`^CREATE ROLE ((?:"(?:[^"]|"")+")|[A-Za-z_][A-Za-z0-9_$]*);$`)
	alterRolePattern  = regexp.MustCompile(`^ALTER ROLE ((?:"(?:[^"]|"")+")|[A-Za-z_][A-Za-z0-9_$]*) WITH (.+);$`)
	roleNamePattern   = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_$]*$`)
)

var allowedRoleAttributes = map[string]bool{
	"SUPERUSER": true, "NOSUPERUSER": true,
	"CREATEDB": true, "NOCREATEDB": true,
	"CREATEROLE": true, "NOCREATEROLE": true,
	"INHERIT": true, "NOINHERIT": true,
	"LOGIN": true, "NOLOGIN": true,
	"REPLICATION": true, "NOREPLICATION": true,
	"BYPASSRLS": true, "NOBYPASSRLS": true,
}

func ValidateGlobalsRoles(path string) error {
	_, err := parseGlobalsRoles(path)
	return err
}

func RestoreMissingRoles(cfg config.Config, globalsPath string) ([]string, error) {
	roles, err := parseGlobalsRoles(globalsPath)
	if err != nil {
		return nil, err
	}
	return restoreMissingRolesWith(cfg, roles, osCommandRunner{})
}

func parseGlobalsRoles(path string) ([]roleDefinition, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat globals dump: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 {
		return nil, fmt.Errorf("globals dump must be a non-empty regular file")
	}
	if info.Size() > 1024*1024 {
		return nil, fmt.Errorf("globals dump exceeds 1 MiB safety limit")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read globals dump: %w", err)
	}

	defs := map[string]*roleDefinition{}
	var order []string
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "--") || strings.HasPrefix(line, "\\") ||
			strings.HasPrefix(line, "SET ") {
			continue
		}
		if matches := createRolePattern.FindStringSubmatch(line); matches != nil {
			name, err := parseRoleIdentifier(matches[1])
			if err != nil {
				return nil, err
			}
			if _, exists := defs[name]; exists {
				return nil, fmt.Errorf("duplicate CREATE ROLE for %q", name)
			}
			defs[name] = &roleDefinition{Name: name}
			order = append(order, name)
			continue
		}
		if matches := alterRolePattern.FindStringSubmatch(line); matches != nil {
			name, err := parseRoleIdentifier(matches[1])
			if err != nil {
				return nil, err
			}
			def, exists := defs[name]
			if !exists {
				return nil, fmt.Errorf("ALTER ROLE for %q appears before CREATE ROLE", name)
			}
			attributes := strings.Fields(matches[2])
			if len(attributes) == 0 {
				return nil, fmt.Errorf("role %q has empty attributes", name)
			}
			for _, attribute := range attributes {
				if !allowedRoleAttributes[attribute] {
					return nil, fmt.Errorf("unsupported role attribute %q for role %q", attribute, name)
				}
			}
			def.Attributes = append([]string(nil), attributes...)
			continue
		}

		// Ignore pg_dumpall sections we intentionally do not apply in data-restore
		// mode. Never execute an unrecognized statement from a Recovery Bundle.
	}

	result := make([]roleDefinition, 0, len(order))
	for _, name := range order {
		def := defs[name]
		if len(def.Attributes) == 0 {
			return nil, fmt.Errorf("role %q is missing ALTER ROLE attributes", name)
		}
		result = append(result, *def)
	}
	return result, nil
}

func parseRoleIdentifier(raw string) (string, error) {
	if strings.HasPrefix(raw, "\"") {
		if len(raw) < 2 || !strings.HasSuffix(raw, "\"") {
			return "", fmt.Errorf("invalid quoted role identifier")
		}
		name := strings.ReplaceAll(raw[1:len(raw)-1], "\"\"", "\"")
		if name == "" || strings.ContainsRune(name, 0) {
			return "", fmt.Errorf("invalid quoted role identifier")
		}
		return name, nil
	}
	if !roleNamePattern.MatchString(raw) {
		return "", fmt.Errorf("invalid role identifier %q", raw)
	}
	return strings.ToLower(raw), nil
}

func restoreMissingRolesWith(cfg config.Config, roles []roleDefinition, runner commandRunner) ([]string, error) {
	if cfg.DBPassword == "" {
		return nil, fmt.Errorf("database password is required")
	}
	env := append(os.Environ(), "PGPASSWORD="+cfg.DBPassword)
	baseArgs := []string{
		"-h", cfg.DBHost,
		"-p", strconv.Itoa(cfg.DBPort),
		"-U", cfg.DBUser,
		"-d", "postgres",
		"-v", "ON_ERROR_STOP=1",
	}
	var created []string
	for _, role := range roles {
		query := "SELECT 1 FROM pg_roles WHERE rolname = " + quoteLiteral(role.Name) + ";"
		args := append(append([]string(nil), baseArgs...), "-At", "-c", query)
		output, err := runner.Run("psql", args, env)
		if err != nil {
			return created, fmt.Errorf("check PostgreSQL role %q: %w", role.Name, err)
		}
		if strings.TrimSpace(output) == "1" {
			continue
		}

		roleIdent := quoteIdentifier(role.Name)
		createArgs := append(append([]string(nil), baseArgs...), "-c", "CREATE ROLE "+roleIdent+";")
		if _, err := runner.Run("psql", createArgs, env); err != nil {
			return created, fmt.Errorf("create PostgreSQL role %q: %w", role.Name, err)
		}
		alterSQL := "ALTER ROLE " + roleIdent + " WITH " + strings.Join(role.Attributes, " ") + ";"
		alterArgs := append(append([]string(nil), baseArgs...), "-c", alterSQL)
		if _, err := runner.Run("psql", alterArgs, env); err != nil {
			return created, fmt.Errorf("apply PostgreSQL role attributes for %q: %w", role.Name, err)
		}
		created = append(created, role.Name)
	}
	return created, nil
}

func quoteLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
