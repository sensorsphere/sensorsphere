## Remote Desktop Commander

Use `run-rdc.sh` from this directory to build and run the dedicated RDC image.

```sh
cd /home/ubuntu/sensorsphere/tools/rdc
./run-rdc.sh
```

The launcher:

- builds `sensorsphere-rdc` with the current user's UID/GID;
- mounts `$HOME` read-write at `/home/ubuntu`;
- exposes the host Docker socket and Docker Compose/Buildx CLI;
- forwards the current SSH agent when available;
- falls back to `$HOME/.ssh/ssh_auth_sock` for forwarded-agent sessions;
- runs RDC as the `ubuntu` user inside the container.

When SSH agent forwarding is active, commands such as `git push` can use the
same forwarded credentials as the host SSH session without copying private keys
into the container.
