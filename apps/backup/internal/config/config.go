package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	BackupRoot        string
	StateRoot         string
	InstanceRoot      string
	AppRoot           string
	MosquittoRoot     string
	DBHost            string
	DBPort            int
	DBName            string
	DBUser            string
	DBPassword        string
	InstanceName      string
	Environment       string
	InstallHost       string
	InstallDir        string
	ComposeProject    string
	StackVersion      string
	APIVersion        string
	FrontendVersion   string
	IngestionVersion  string
	NginxVersion      string
	MigrationsVersion string
	BackupVersion     string
	ImageRegistry     string
	ImageNamespace    string
	RetentionDaily    int
	RetentionWeekly   int
	RetentionMonthly  int
	WarningAgeHours   int
	CriticalAgeHours  int
}

func envDefault(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	raw := envDefault(key, strconv.Itoa(fallback))
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return value, nil
}

func Load() (Config, error) {
	port, err := strconv.Atoi(envDefault("DB_PORT", "5432"))
	if err != nil || port <= 0 || port > 65535 {
		return Config{}, fmt.Errorf("invalid DB_PORT")
	}
	retentionDaily, err := envInt("SENSORSPHERE_BACKUP_RETENTION_DAILY", 7)
	if err != nil {
		return Config{}, err
	}
	retentionWeekly, err := envInt("SENSORSPHERE_BACKUP_RETENTION_WEEKLY", 4)
	if err != nil {
		return Config{}, err
	}
	retentionMonthly, err := envInt("SENSORSPHERE_BACKUP_RETENTION_MONTHLY", 6)
	if err != nil {
		return Config{}, err
	}
	warningAgeHours, err := envInt("SENSORSPHERE_BACKUP_WARNING_AGE_HOURS", 26)
	if err != nil {
		return Config{}, err
	}
	criticalAgeHours, err := envInt("SENSORSPHERE_BACKUP_CRITICAL_AGE_HOURS", 48)
	if err != nil {
		return Config{}, err
	}
	if criticalAgeHours > 0 && warningAgeHours > criticalAgeHours {
		return Config{}, fmt.Errorf("SENSORSPHERE_BACKUP_WARNING_AGE_HOURS must be <= SENSORSPHERE_BACKUP_CRITICAL_AGE_HOURS")
	}

	return Config{
		BackupRoot:        envDefault("BACKUP_ROOT", "/backups"),
		StateRoot:         envDefault("BACKUP_STATE_ROOT", "/state"),
		InstanceRoot:      envDefault("INSTANCE_ROOT", "/instance"),
		AppRoot:           envDefault("APP_DATA_ROOT", "/source/app"),
		MosquittoRoot:     envDefault("MOSQUITTO_DATA_ROOT", "/source/mosquitto"),
		DBHost:            envDefault("DB_HOST", "timescaledb"),
		DBPort:            port,
		DBName:            envDefault("DB_NAME", envDefault("POSTGRES_DB", "sensorsphere")),
		DBUser:            envDefault("DB_USER", envDefault("POSTGRES_USER", "sensorsphere")),
		DBPassword:        envDefault("DB_PASSWORD", envDefault("POSTGRES_PASSWORD", "")),
		InstanceName:      envDefault("INSTANCE_NAME", "SensorSphere"),
		Environment:       envDefault("SENSORSPHERE_ENVIRONMENT", "DEFAULT"),
		InstallHost:       envDefault("SENSORSPHERE_INSTALL_HOST", ""),
		InstallDir:        envDefault("SENSORSPHERE_INSTALL_DIR", ""),
		ComposeProject:    envDefault("SENSORSPHERE_COMPOSE_PROJECT", envDefault("COMPOSE_PROJECT_NAME", "")),
		StackVersion:      envDefault("SENSORSPHERE_STACK_VERSION", ""),
		APIVersion:        envDefault("SENSORSPHERE_API_VERSION", ""),
		FrontendVersion:   envDefault("SENSORSPHERE_FRONTEND_VERSION", ""),
		IngestionVersion:  envDefault("SENSORSPHERE_INGESTION_VERSION", ""),
		NginxVersion:      envDefault("SENSORSPHERE_NGINX_VERSION", ""),
		MigrationsVersion: envDefault("SENSORSPHERE_MIGRATIONS_VERSION", ""),
		BackupVersion:     envDefault("SENSORSPHERE_BACKUP_VERSION", ""),
		ImageRegistry:     envDefault("SENSORSPHERE_IMAGE_REGISTRY", "ghcr.io"),
		ImageNamespace:    envDefault("SENSORSPHERE_IMAGE_NAMESPACE", "sensorsphere"),
		RetentionDaily:    retentionDaily,
		RetentionWeekly:   retentionWeekly,
		RetentionMonthly:  retentionMonthly,
		WarningAgeHours:   warningAgeHours,
		CriticalAgeHours:  criticalAgeHours,
	}, nil
}

func (c Config) ValidateForCreate() error {
	if c.DBPassword == "" {
		return fmt.Errorf("POSTGRES_PASSWORD/DB_PASSWORD is required")
	}
	if c.BackupRoot == "" || c.StateRoot == "" {
		return fmt.Errorf("backup and state roots are required")
	}
	if c.AppRoot == "" || c.InstanceRoot == "" {
		return fmt.Errorf("application and instance roots are required")
	}
	return nil
}

func (c Config) Image(repository, version string) string {
	if version == "" {
		return ""
	}
	return fmt.Sprintf("%s/%s/%s:%s", c.ImageRegistry, c.ImageNamespace, repository, version)
}
