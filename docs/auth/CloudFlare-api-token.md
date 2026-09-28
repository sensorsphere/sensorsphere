# Cloudflare API token for SensorSphere HTTPS

SensorSphere's external Caddy proxy uses the Cloudflare DNS API only for
ACME DNS-01 certificate validation. The token must be scoped to the
`f-colas.com` zone and must not use the Cloudflare Global API Key.

Cloudflare currently recommends API tokens instead of Global API Keys. The
built-in **Edit Zone DNS** token template grants DNS write access; this guide
further restricts the token to the single `f-colas.com` zone.

Official Cloudflare references:

- https://developers.cloudflare.com/fundamentals/api/reference/template/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

## Create the token

1. Sign in to the Cloudflare dashboard.
2. Open **My Profile**.
3. Open **API Tokens**.
4. Select **Create Token**.
5. Start from the **Edit Zone DNS** template, or create a custom token with
   equivalent permissions.
6. Give the token a descriptive name, for example:
   `SensorSphere Caddy DNS-01`.
7. Configure the zone permissions:
   - **Zone / DNS / Edit**
   - **Zone / Zone / Read** if the selected Cloudflare/Caddy integration
     requires zone discovery. Keeping it is recommended for compatibility.
8. Under **Zone Resources**, select:
   - **Include**
   - **Specific zone**
   - **f-colas.com**
9. Do not grant access to all zones.
10. IP filtering is optional. Only add a source-IP restriction if the public
    egress IP used by `na-01` is stable; otherwise certificate renewal could
    fail later.
11. Set an expiration only if you also plan token rotation before that date.
    Automatic HTTPS renewal must continue to work unattended.
12. Review the summary and select **Create Token**.
13. Copy the token immediately. Cloudflare shows the token secret only once.

Cloudflare may issue either the historical token shape or the newer
`cfut_`-prefixed format. The SensorSphere Caddy image includes a local
compatibility adjustment for both formats while still using the official
`caddy-dns/cloudflare` v0.2.4 provider source.

## Install the token on na-01

Do **not** paste the token into Git, ChatGPT, the Caddyfile, or the SensorSphere
application `.env`.

When the HTTPS proxy patch is installed, create:

```text
/home/ubuntu/sensorsphere-proxy/.env
```

from:

```text
/home/ubuntu/sensorsphere-proxy/.env.example
```

and set:

```dotenv
CLOUDFLARE_API_TOKEN=<the-token-created-above>
ACME_EMAIL=<your-email-for-certificate-notices>
```

Protect the file:

```bash
chmod 600 /home/ubuntu/sensorsphere-proxy/.env
```

The proxy configuration reads the token from the environment. It is never
stored in the Caddyfile.

## Optional token verification

After placing the token in the proxy `.env`, Cloudflare can be queried with
the token using the standard Bearer authorization header. Do not put the
literal token in shell history; load it from the file/environment instead.

A successful token verification only proves that the token is valid. The
final SensorSphere test is successful ACME DNS-01 issuance and HTTPS access.

## What Caddy will do with this token

For each SensorSphere HTTPS hostname, Caddy will temporarily create and remove
a TXT record below:

```text
_acme-challenge.<hostname>
```

in the `f-colas.com` zone.

This lets a public certificate authority validate ownership without needing
direct Internet access to the private Headscale/Tailscale address.

Normal SensorSphere traffic remains direct over the private network; Cloudflare
is used for DNS and ACME validation, not as an HTTP reverse proxy.

## Rotation or revocation

To rotate the token:

1. Create a new token with the same restricted permissions.
2. Replace `CLOUDFLARE_API_TOKEN` in
   `/home/ubuntu/sensorsphere-proxy/.env`.
3. Restart the Caddy proxy.
4. Confirm that Caddy starts without DNS-provider errors.
5. Revoke the previous Cloudflare token.

If the token is exposed, revoke it first in Cloudflare, create a replacement,
update the proxy `.env`, and restart Caddy.
