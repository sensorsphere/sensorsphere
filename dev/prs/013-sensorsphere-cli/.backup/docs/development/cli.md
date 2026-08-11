# SensorSphere CLI

The SensorSphere CLI provides one stable entry point for development and
operational commands.

## Commands

### Version

```bash
sensorsphere version
```

### Doctor

```bash
sensorsphere doctor
```

Checks:

- project root
- Docker Compose configuration
- Docker Compose services
- database migration status
- API health
- sensor catalog
- latest telemetry

The default API URL is:

```text
http://127.0.0.1:8080
```

Override it with:

```bash
export SENSORSPHERE_BASE_URL=https://sensorsphere.example.com
```

### PR commands

Existing PR commands are delegated through the CLI:

```bash
sensorsphere pr list
sensorsphere pr info 012
sensorsphere pr apply 012
sensorsphere pr verify 012
```

### Database commands

```bash
sensorsphere db status
sensorsphere db migrate
sensorsphere db history
```

## Project Discovery

The CLI locates SensorSphere using this order:

1. `SENSORSPHERE_ROOT`
2. the installed binary location
3. current directory and its parents

This allows the CLI to work both from the repository and through the
`~/.local/bin/sensorsphere` symlink.
