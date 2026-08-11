# SensorSphere CLI

The SensorSphere CLI provides a stable entry point for operational and
development commands.

## Commands

```bash
sensorsphere version
sensorsphere doctor
sensorsphere pr list
sensorsphere pr info 013
sensorsphere db status
sensorsphere db migrate
sensorsphere db history
```

## Build ownership rule

Containerized build steps that write into the repository must run with the host
user UID/GID.

Example:

```bash
docker run --user "$(id -u):$(id -g)" ...
```

SensorSphere development workflows must not create root-owned source or build
artifacts in the repository.
