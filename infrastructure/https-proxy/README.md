# SensorSphere HTTPS reverse proxy

This host-level Caddy proxy terminates HTTPS for SensorSphere environments
and uses Cloudflare DNS-01 for public certificate issuance. It is
intentionally separate from each SensorSphere stack.

Deployment path on na-01:

```text
/home/ubuntu/sensorsphere-proxy
```

Before startup, copy `.env.example` to `.env` and configure the Cloudflare
token following `docs/auth/CloudFlare-api-token.md`.

Initial routes:

- dev.sensorsphere.f-colas.com -> host port 8080
- dit.sensorsphere.f-colas.com -> host port 8081
- test1.sensorsphere.f-colas.com -> host port 48080

FIT is intentionally not configured yet because its host port is not defined.
Add its FQDN only when the fresh FIT installation is created.

The DNS records must resolve to the private Headscale/Tailscale address used
to reach na-01 and remain DNS-only in Cloudflare. Cloudflare is used for DNS
and ACME DNS-01 validation, not for proxying SensorSphere application traffic.
