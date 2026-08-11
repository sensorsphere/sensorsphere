# PR-013 — SensorSphere CLI

## Revision

2

## Fix in revision 2

The Go build container now runs with the current Linux user's UID and GID:

```bash
--user "$(id -u):$(id -g)"
```

This prevents Docker from creating `root:root` files inside the SensorSphere
repository.

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

## Apply

If revision 1 failed during apply, remove the root-owned binary first:

```bash
sudo rm -f /home/ubuntu/sensorsphere/dev/bin/sensorsphere
```

Then extract and apply revision 2.

## Rollback

```bash
./dev/tools/pr rollback 013
```
