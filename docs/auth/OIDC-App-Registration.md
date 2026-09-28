# SensorSphere OIDC App Registration

This guide explains how to register SensorSphere with Google and Microsoft
Entra ID and how to isolate credentials between environments.

SensorSphere accounts are provider-independent. One account can have several
external identities, including multiple Google accounts and Microsoft
identities. The SensorSphere role and status belong to the account, not to an
email address.

## Stable provider identities

Never use email as the immutable login key.

- Google: use the OIDC sub claim as provider_subject.
- Microsoft: use the Entra tid tenant plus oid object ID as the canonical
  identity. SensorSphere stores the tenant separately as well.
- provider_email is display/contact metadata and may change.
- A provider identity can belong to only one SensorSphere account.

## Reserved callback paths

Use these paths when the provider login flow is enabled:

- Google: /api/v1/auth/oidc/google/callback
- Microsoft: /api/v1/auth/oidc/microsoft/callback

For https://sensorsphere.example.com the redirect URIs are therefore:

~~~text
https://sensorsphere.example.com/api/v1/auth/oidc/google/callback
https://sensorsphere.example.com/api/v1/auth/oidc/microsoft/callback
~~~

Scheme, hostname, port, path, case and trailing slash must match the
provider registration exactly.

The current user/identity-management foundation reserves these variables and
paths. Do not enable real provider authentication until the OIDC callback
implementation is present in the deployed Stack Release.

## Environment isolation

Use a distinct OIDC client/app registration per environment whenever
possible.

| Environment | Recommendation | Notes |
| --- | --- | --- |
| DEV | Dedicated DEV client | DEV FQDN or localhost; never reuse PROD secret |
| TEST1 | Dedicated test client or shared non-prod client | Disposable integration testing |
| FIT | Dedicated FIT client | Production-like onboarding validation |
| DIT | Dedicated DIT client | Isolate from DEV and FIT |
| PROD | Dedicated PROD client | Production domains and secrets only |

At minimum, PROD credentials must be completely separate from all
non-production environments. Separate registrations are preferred because
redirect URIs, consent state, secret rotation and incident containment then
remain environment-local.

Never commit client secrets to Git.
## SensorSphere configuration

Example with both providers:

~~~dotenv
SENSORSPHERE_AUTH_ENABLED=true
SENSORSPHERE_AUTH_PROVIDERS=google,microsoft
SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.com

SENSORSPHERE_GOOGLE_CLIENT_ID=<google-client-id>
SENSORSPHERE_GOOGLE_CLIENT_SECRET=<google-client-secret>

SENSORSPHERE_MICROSOFT_CLIENT_ID=<entra-application-client-id>
SENSORSPHERE_MICROSOFT_CLIENT_SECRET=<entra-client-secret>
SENSORSPHERE_MICROSOFT_TENANT=common
~~~

DEV role-switch testing without external authentication:

~~~dotenv
SENSORSPHERE_ENVIRONMENT=DEV
SENSORSPHERE_AUTH_ENABLED=false
SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED=true
SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE=admin
~~~

The DEV switch is unavailable outside DEV and when real authentication is
enabled.

### Bootstrap admin

SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL is used only to establish the initial
protected administrator when the user database is empty.

Once created, the database marks that account as the Bootstrap Admin.
Changing the environment variable later must not promote another existing
user. The bootstrap account cannot be demoted or disabled.

Validate first-admin onboarding on a fresh FIT installation before enabling
the same configuration in PROD.

## Google registration

Official references:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://support.google.com/cloud/answer/15549945

### Create the Google Cloud configuration

1. Create or select the Google Cloud project for the target environment.
2. Configure the OAuth consent screen / audience.
3. Use Internal when the deployment must be restricted to an eligible Google
   Workspace organization.
4. Use External when other Google accounts must be accepted.
5. During Testing, add the required test users.
6. Request only the identity scopes needed for SensorSphere sign-in:
   openid, email and profile.

Create an OAuth 2.0 client of type Web application and add the exact redirect
URI, for example:

~~~text
https://fit.example.com/api/v1/auth/oidc/google/callback
~~~

Google normally requires HTTPS for hosted redirect URIs; localhost is the
main development exception. A mismatch produces redirect_uri_mismatch.

Store the values only in the target environment:

~~~dotenv
SENSORSPHERE_GOOGLE_CLIENT_ID=...
SENSORSPHERE_GOOGLE_CLIENT_SECRET=...
~~~
## Microsoft Entra ID registration

Official references:

- https://learn.microsoft.com/entra/identity-platform/v2-protocols-oidc
- https://learn.microsoft.com/entra/identity-platform/how-to-add-redirect-uri
- https://learn.microsoft.com/entra/identity-platform/reply-url

### Create the App Registration

1. Open Entra ID > App registrations.
2. Select New registration.
3. Use an environment-specific name such as SensorSphere FIT or
   SensorSphere PROD.
4. Select the supported account type that matches the installation.

Typical choices:

- one organization: tenant-specific;
- multiple Entra organizations: multi-tenant organizational accounts;
- organizational plus personal Microsoft accounts: choose the corresponding
  broader audience.

Under Authentication add a Web platform redirect URI, for example:

~~~text
https://fit.example.com/api/v1/auth/oidc/microsoft/callback
~~~

Under Certificates & secrets create a credential. Client secrets are
supported for straightforward installations; record the expiry and plan
rotation. Certificates are preferable where the deployment security model
supports them.

Store:

~~~dotenv
SENSORSPHERE_MICROSOFT_CLIENT_ID=...
SENSORSPHERE_MICROSOFT_CLIENT_SECRET=...
~~~

For intentionally broad sign-in audiences:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=common
~~~

For an organization-restricted installation use its tenant ID instead:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=<tenant-guid>
~~~

Microsoft also supports authorities such as organizations or consumers. The
selected value must match the App Registration audience.

For authorization, do not use preferred_username or email. SensorSphere uses
the stable tenant/object context, derived from tid plus oid.
## Multiple identities on one SensorSphere account

Example:

~~~text
SensorSphere user
  role: Admin
  status: Active
  identities:
    - google / sub=... / first@example.com
    - google / sub=... / second@example.com
    - microsoft / tid=... / oid=... / user@company.com
~~~

Never merge two accounts automatically because their provider emails match.
Linking must be explicit and must prove control of the new provider identity
through an authenticated OIDC flow.

The DEV identity editor exists only to exercise the data model. It is not a
replacement for provider authentication and is disabled when real
authentication is enabled.

## Deployment checklist

For each environment:

1. Confirm the public base URL and HTTPS certificate.
2. Register the exact Google and/or Microsoft callback URI.
3. Create environment-specific client credentials.
4. Configure provider consent and audience restrictions.
5. Configure SENSORSPHERE_AUTH_PROVIDERS.
6. Configure provider client IDs/secrets and Microsoft tenant when used.
7. Configure the bootstrap admin email for initial bootstrap.
8. Deploy a Stack Release containing the OIDC callback implementation.
9. Test provider login.
10. Test that an unknown user becomes Pending.
11. Test that only an Admin can approve the request.
12. Link a second identity and verify it opens the same SensorSphere account.
13. Verify backend role enforcement, not only UI visibility.
14. Perform the complete fresh-install test in FIT before PROD.

## Secret rotation

- Never store provider secrets in the repository.
- Rotate credentials before expiration.
- When the provider permits overlap, deploy the new credential before
  removing the previous one.
- Restart/redeploy the SensorSphere API after credential changes.
- Verify an end-to-end login after rotation.
- If a credential is exposed, revoke it at the provider first, replace it in
  the affected environment, then restart SensorSphere.
