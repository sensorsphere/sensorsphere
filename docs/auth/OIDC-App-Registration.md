# SensorSphere OIDC App Registration

This document is the operational runbook for creating the Google and
Microsoft Entra ID applications used by SensorSphere OIDC authentication.

It covers the exact provider-console menus, values to create/copy, callback
URIs, environment isolation, scopes, secrets, and verification steps.

SensorSphere currently uses the OAuth 2.0 / OpenID Connect Authorization Code
Flow. The backend sends `response_type=code`, exchanges the authorization code
server-side with the provider, and validates the returned ID token.

Requested scopes are exactly:

~~~text
openid email profile
~~~

No Google API access and no Microsoft Graph API permissions are required by
the current SensorSphere sign-in implementation.

## SensorSphere OIDC model

SensorSphere accounts are provider-independent. One SensorSphere account may
have several external identities.

Never use email as the immutable identity key.

- Google: immutable identity is the OIDC `sub` claim.
- Microsoft: immutable identity is the Entra `tid` tenant plus `oid`.
- Provider email is display/contact metadata and may change.
- Never auto-merge accounts only because two providers report the same email.

## Callback URIs

SensorSphere implements these callback paths:

~~~text
Google:
  /api/v1/auth/oidc/google/callback

Microsoft:
  /api/v1/auth/oidc/microsoft/callback
~~~

For a public URL such as:

~~~text
https://dev.sensorsphere.f-colas.com
~~~

register exactly:

~~~text
https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/google/callback
https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/microsoft/callback
~~~

The scheme, hostname, port, path, case, and trailing slash must match exactly.
Do not add a trailing slash to the callback paths above.

SensorSphere builds the callback URI from `SENSORSPHERE_PUBLIC_URL`, so that
variable must contain the exact externally reachable HTTPS origin.

## Environment isolation

Use a separate OAuth/OIDC client or App Registration per SensorSphere
environment whenever practical.

Current/known SensorSphere HTTPS endpoints are:

| Environment | Public URL | Google callback | Microsoft callback |
| --- | --- | --- | --- |
| DEV | `https://dev.sensorsphere.f-colas.com` | `https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/google/callback` | `https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/microsoft/callback` |
| DIT | `https://dit.sensorsphere.f-colas.com` | `https://dit.sensorsphere.f-colas.com/api/v1/auth/oidc/google/callback` | `https://dit.sensorsphere.f-colas.com/api/v1/auth/oidc/microsoft/callback` |
| TEST1 | `https://test1.sensorsphere.f-colas.com` | `https://test1.sensorsphere.f-colas.com/api/v1/auth/oidc/google/callback` | `https://test1.sensorsphere.f-colas.com/api/v1/auth/oidc/microsoft/callback` |
| FIT | Define its final HTTPS FQDN first | Register only the final FIT callback | Register only the final FIT callback |
| PROD | Define its final HTTPS FQDN first | Production callback only | Production callback only |

Do not guess FIT/PROD hostnames. Create the DNS/HTTPS endpoint first, then
register its exact callback.

Recommended naming:

~~~text
Google OAuth clients:
  SensorSphere DEV
  SensorSphere DIT
  SensorSphere TEST1
  SensorSphere FIT
  SensorSphere PROD

Microsoft App Registrations:
  SensorSphere DEV
  SensorSphere DIT
  SensorSphere TEST1
  SensorSphere FIT
  SensorSphere PROD
~~~

At minimum, production credentials must never be shared with non-production.

## SensorSphere environment variables

### Authentication default and fail-closed policy

The installation policy is environment-sensitive:

- `DEV`: authentication defaults to disabled. This preserves the development
  role-switch workflow. Set `SENSORSPHERE_AUTH_ENABLED=true` explicitly to
  exercise real OIDC in DEV.
- every non-DEV environment, including `DIT`, `TEST1`, `FIT`, and
  `PROD`: authentication defaults to enabled.
- a non-DEV installation explicitly configured with
  `SENSORSPHERE_AUTH_ENABLED=false` is rejected.
- an auth-enabled installation is rejected before the stack starts when the
  public HTTPS URL, bootstrap-admin email, or credentials for an enabled
  provider are incomplete.

This is intentionally fail-closed: missing authentication configuration must
never silently turn a DIT/FIT/PROD installation into an unauthenticated
application.

Example with both providers enabled:

~~~dotenv
SENSORSPHERE_AUTH_ENABLED=true
SENSORSPHERE_PUBLIC_URL=https://fit.example.com
SENSORSPHERE_AUTH_PROVIDERS=google,microsoft
SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.com

SENSORSPHERE_GOOGLE_CLIENT_ID=<google-client-id>
SENSORSPHERE_GOOGLE_CLIENT_SECRET=<google-client-secret>

SENSORSPHERE_MICROSOFT_CLIENT_ID=<application-client-id>
SENSORSPHERE_MICROSOFT_CLIENT_SECRET=<client-secret-value>
SENSORSPHERE_MICROSOFT_TENANT=common
~~~

Important:

- Never commit secrets to Git.
- For Microsoft, store the client secret **Value**, not its Secret ID.
- Restart/redeploy the API after changing OIDC credentials.
- When real OIDC is enabled, the DEV role switch is not used.

For HTTPS/Cloudflare prerequisites, see:

- `docs/auth/CloudFlare-api-token.md`
- `infrastructure/https-proxy/README.md`

# Google OIDC registration

Official Google console area:

~~~text
Google Cloud Console
  -> select/create project
  -> Google Auth Platform
~~~

## Google 1 - Create or select the project

1. Open Google Cloud Console.
2. Use the project selector in the top bar.
3. Create a dedicated project if desired, or select the project dedicated to
   the SensorSphere environment.
4. Confirm the correct project is selected before continuing.

A separate Google Cloud project per environment is the strongest isolation.
A single project with one OAuth client per environment also works, but shares
branding, audience, test-user configuration, and verification state.

## Google 2 - Initialize Google Auth Platform

If this project has never been configured for OAuth:

1. Open **Google Auth Platform**.
2. On **Overview**, click **Get started**.
3. Enter the application information requested by Google.
4. Set **App name**, for example `SensorSphere DEV`.
5. Select a **User support email**.
6. Configure the **Audience**.
7. Add the requested **Developer contact information**.
8. Complete the initial setup.

After initialization, the Google Auth Platform left navigation contains the
main pages used below:

~~~text
Overview
Branding
Audience
Clients
Data Access
Verification Center
~~~

## Google 3 - Configure Branding

Go to:

~~~text
Google Auth Platform -> Branding
~~~

Configure:

- **App name**: for example `SensorSphere DEV`.
- **User support email**: a monitored address.
- **App logo**: optional for initial non-production testing.
- **Application home page**: required when Google asks for production
  verification.
- **Privacy policy** and **Terms of service**: required for an external
  production app when applicable.
- **Authorized domains**: add the registrable/top private domain, for this
  installation:

~~~text
f-colas.com
~~~

Do not enter the full SensorSphere host such as
`dev.sensorsphere.f-colas.com` in this field; Google expects the registrable
domain and then permits its subdomains in the OAuth configuration.

If Google requires domain ownership verification, verify the domain with
Google Search Console using a project owner/editor account.

For DEV/DIT/TEST1 testing, keep branding simple until the OIDC flow itself is
validated.

## Google 4 - Configure Audience

Go to:

~~~text
Google Auth Platform -> Audience
~~~

Choose the user type deliberately:

- **Internal**: only available for eligible Google Workspace organizations;
  use when SensorSphere must be restricted to that organization.
- **External**: use when normal Google accounts outside one Workspace
  organization must be allowed.

For an External application during initial validation:

1. Keep **Publishing status = Testing**.
2. Under **Test users**, click **Add users**.
3. Add every Google account that must be able to test SensorSphere login.
4. Save.

Google currently limits Testing apps to a finite test-user list and test-user
authorizations can expire. This mode is appropriate for DEV/FIT validation,
not a permanent production setup.

When production use is required, return to **Audience** and publish the app as
appropriate. Google may require verification depending on branding and scopes.

## Google 5 - Configure Data Access / scopes

Go to:

~~~text
Google Auth Platform -> Data Access
~~~

SensorSphere only needs the OpenID Connect identity scopes:

~~~text
openid
email
profile
~~~

Do not add Drive, Gmail, Calendar, Admin SDK, or other Google API scopes for
SensorSphere authentication.

If the console presents **Add or remove scopes**, select only the scopes
needed for identity/sign-in.

## Google 6 - Create the OAuth client

Go to:

~~~text
Google Auth Platform -> Clients -> Create Client
~~~

Then:

1. **Application type** -> **Web application**.
2. **Name** -> for example `SensorSphere DEV`.

3. **Authorized JavaScript origins**:
   - the current SensorSphere backend OIDC flow does not require this field;
   - it may be left empty unless another browser-side Google integration is
     added later.
4. Under **Authorized redirect URIs**, click **Add URI**.
5. Enter the exact SensorSphere Google callback, for example:

~~~text
https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/google/callback
~~~

6. Click **Create**.

Google displays the generated credentials.

Copy and securely store:

~~~text
Client ID
Client secret
~~~

Map them to:

~~~dotenv
SENSORSPHERE_GOOGLE_CLIENT_ID=<Client ID>
SENSORSPHERE_GOOGLE_CLIENT_SECRET=<Client secret>
~~~

The secret is confidential. Do not put it in documentation, Git, screenshots,
tickets, or chat logs.

If Google offers a credential JSON download, it can be kept as a secure
administrative backup, but SensorSphere only needs the Client ID and Client
secret values in its environment configuration.

## Google 7 - Verify the Google registration

Before enabling SensorSphere auth, verify in:

~~~text
Google Auth Platform -> Clients -> SensorSphere <ENV>
~~~

Confirm:

- Application type is **Web application**.
- The callback URI is exact.
- The client belongs to the intended environment/project.
- The selected Google account is a test user when Publishing status is
  Testing.
- No unnecessary OAuth scopes were added.

Typical Google errors:

- `redirect_uri_mismatch`: the registered callback differs from
  `SENSORSPHERE_PUBLIC_URL + /api/v1/auth/oidc/google/callback`.
- `access_denied` / tester-related error: account is not in the Test users
  list while the app is in Testing.
- `org_internal`: an Internal app is being used by an account outside its
  allowed Workspace organization.

# Microsoft Entra ID OIDC registration

Use the Microsoft Entra admin center.

Current menu path:

~~~text
Microsoft Entra admin center
  -> Identity
  -> Applications
  -> App registrations
~~~

## Microsoft 1 - Create the App Registration

1. Open **Identity -> Applications -> App registrations**.
2. Click **New registration**.
3. Enter **Name**, for example `SensorSphere DEV`.
4. Select **Supported account types** according to the intended audience.

Recommended mapping:

| Entra App Registration audience | SensorSphere tenant value |
| --- | --- |
| Accounts in this organizational directory only | `<tenant-guid>` |
| Accounts in any organizational directory | `organizations` or `common` |
| Accounts in any organizational directory and personal Microsoft accounts | `common` |
| Personal Microsoft accounts only | `consumers` |

For a private company deployment, prefer the tenant-specific GUID when users
must come from one tenant only.

For a broadly usable SensorSphere installation, `common` is the simplest
choice, provided the App Registration's supported account types also allow
that audience.

During registration you may optionally configure the redirect URI directly:

- **Platform**: `Web`
- **Redirect URI**:
  `https://<environment>/api/v1/auth/oidc/microsoft/callback`

Then click **Register**.

## Microsoft 2 - Copy the IDs from Overview

After registration, the **Overview** page shows identifiers.

Copy:

~~~text
Application (client) ID
Directory (tenant) ID
~~~

Use:

~~~dotenv
SENSORSPHERE_MICROSOFT_CLIENT_ID=<Application (client) ID>
~~~

If using a single-tenant configuration, also use:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=<Directory (tenant) ID>
~~~

Do not use **Object ID** from the App Registration as the client ID.

## Microsoft 3 - Configure Authentication

Go to:

~~~text
App registrations
  -> SensorSphere <ENV>
  -> Manage
  -> Authentication
~~~

If no Web platform exists:

1. Under **Platform configurations**, click **Add a platform**.
2. Select **Web**.
3. Add the exact redirect URI, for example:

~~~text
https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/microsoft/callback
~~~

4. Click **Configure** / **Save**.

If a Web platform already exists, add the callback under its **Redirect URIs**.

For the current SensorSphere Authorization Code Flow:

- do **not** enable **Access tokens** under *Implicit grant and hybrid flows*;
- do **not** enable **ID tokens** under *Implicit grant and hybrid flows*.

Those switches are for implicit/hybrid flows. SensorSphere requests
`response_type=code` and receives the ID token from the token endpoint.

A Front-channel logout URL is not required by the current SensorSphere OIDC
implementation.

## Microsoft 4 - Create the client secret

Go to:

~~~text
App registrations
  -> SensorSphere <ENV>
  -> Manage
  -> Certificates & secrets
  -> Client secrets
  -> New client secret
~~~

Then:

1. Enter a description, for example `SensorSphere DEV API`.
2. Select an expiration appropriate for the environment.
3. Click **Add**.
4. Immediately copy the secret **Value**.

Important: Microsoft only displays the client secret Value once.

Do **not** copy the **Secret ID**. SensorSphere needs the secret **Value**:

~~~dotenv
SENSORSPHERE_MICROSOFT_CLIENT_SECRET=<Value>
~~~

Record the expiration date in your operational password/secret-management
process so the secret can be rotated before expiry.

Microsoft recommends stronger credential types such as certificates for
production confidential clients. The current SensorSphere implementation is
configured for a client secret, so use a secret unless/until certificate-based
client authentication is explicitly implemented.

## Microsoft 5 - API permissions

Go to:

~~~text
App registrations
  -> SensorSphere <ENV>
  -> Manage
  -> API permissions
~~~

For the current SensorSphere sign-in flow, do not add Microsoft Graph
permissions just to obtain identity information.

SensorSphere requests only:

~~~text
openid
email
profile
~~~

These are OpenID Connect scopes supplied by the Microsoft identity platform.

No `User.Read`, Mail, Calendar, Groups, or other Graph permissions are
required for the current implementation.

## Microsoft 6 - Token configuration

Go to:

~~~text
App registrations
  -> SensorSphere <ENV>
  -> Manage
  -> Token configuration
~~~

No optional claim is required by the current SensorSphere implementation.

SensorSphere accepts email metadata from `email` or
`preferred_username`, but authorization identity is based on the stable
`tid + oid` claims.

Do not make email the account key.

## Microsoft 7 - Configure SENSORSPHERE_MICROSOFT_TENANT

Examples:

Single tenant:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
~~~

Any Entra organizational tenant:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=organizations
~~~

Organizational plus personal Microsoft accounts:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=common
~~~

Personal Microsoft accounts only:

~~~dotenv
SENSORSPHERE_MICROSOFT_TENANT=consumers
~~~

The value must be consistent with the **Supported account types** selected in
the App Registration.

## Microsoft 8 - Verify the App Registration

Check:

~~~text
Overview
  Application (client) ID          -> SENSORSPHERE_MICROSOFT_CLIENT_ID
  Directory (tenant) ID            -> tenant GUID when single-tenant

Authentication
  Platform                         -> Web
  Redirect URI                     -> exact SensorSphere callback
  Implicit grant/hybrid checkboxes -> OFF

Certificates & secrets
  Client secret                    -> valid and not expired
  Value                            -> stored in SensorSphere
  Secret ID                        -> NOT used by SensorSphere

API permissions
  No extra Graph permissions required for SensorSphere OIDC login
~~~

Typical Microsoft errors:

- `AADSTS50011`: redirect URI mismatch.
- `invalid_client`: wrong client ID, wrong/expired secret, or Secret ID used
  instead of the secret Value.
- tenant/audience errors: `SENSORSPHERE_MICROSOFT_TENANT` and Supported
  account types do not match the intended users.

## One registration per environment - practical procedure

For each environment, repeat the provider registration with that
environment's exact public URL.

Example for DEV:

~~~dotenv
SENSORSPHERE_PUBLIC_URL=https://dev.sensorsphere.f-colas.com
~~~

Google redirect:

~~~text
https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/google/callback
~~~

Microsoft redirect:

~~~text
https://dev.sensorsphere.f-colas.com/api/v1/auth/oidc/microsoft/callback
~~~

For DIT, replace only the public host with:

~~~text
https://dit.sensorsphere.f-colas.com
~~~

For TEST1:

~~~text
https://test1.sensorsphere.f-colas.com
~~~

For FIT and PROD, first establish DNS + HTTPS, then register the final URLs.
Do not register HTTP callbacks for deployed environments.

## First SensorSphere OIDC activation

Recommended order for a fresh environment:

1. Confirm DNS resolves the environment FQDN.
2. Confirm HTTPS is valid from a normal browser.
3. Create the Google and/or Microsoft provider registration.
4. Add the exact callback URI at the provider.
5. Put client IDs/secrets into that environment's private configuration.

6. Set `SENSORSPHERE_PUBLIC_URL`.
7. Set `SENSORSPHERE_AUTH_PROVIDERS`.
8. Set `SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL`.
9. Set `SENSORSPHERE_AUTH_ENABLED=true`.
10. Restart/redeploy the SensorSphere API.
11. Open SensorSphere in a private/incognito browser window.
12. Test the provider login.
13. Confirm the bootstrap administrator is created only as intended.
14. Test a second unknown identity and confirm it becomes Pending.
15. Approve it from Administration -> Users.
16. Link a second provider identity and confirm it resolves to the same
    SensorSphere account when explicitly linked.

## Bootstrap admin

`SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL` is used only to establish the first
protected administrator when the user database is empty.

Once that account is materialized, the database protects the Bootstrap Admin.
Changing the environment variable later must not silently promote a different
existing user.

Validate the complete first-admin onboarding flow on a fresh FIT installation
before production.

## Secret rotation

Google:

1. Create/obtain the replacement OAuth client secret/credential.
2. Update the target environment.
3. Restart the API.
4. Validate login.
5. Remove/revoke the old credential when safe.

Microsoft:

1. Create a second client secret under **Certificates & secrets**.
2. Copy its **Value** immediately.
3. Update SensorSphere.
4. Restart the API and validate login.
5. Delete the previous secret only after the new one works.

## Final per-environment checklist

Before declaring an environment ready:

- [ ] Public FQDN is final.
- [ ] HTTPS certificate is valid.
- [ ] `SENSORSPHERE_PUBLIC_URL` exactly matches the HTTPS origin.
- [ ] Google client belongs to the correct environment.
- [ ] Google Authorized redirect URI is exact.
- [ ] Google Audience/Test users are correct.
- [ ] Google scopes are only those needed.
- [ ] Microsoft App Registration belongs to the correct environment.
- [ ] Microsoft Supported account types match the intended tenant mode.
- [ ] Microsoft Web redirect URI is exact.
- [ ] Microsoft implicit/hybrid checkboxes are off.
- [ ] Microsoft client secret **Value** is stored, not Secret ID.
- [ ] Microsoft secret expiration is recorded.
- [ ] No unnecessary Microsoft Graph permission was added.
- [ ] Provider secrets are absent from Git.
- [ ] Login works through the external HTTPS URL.
- [ ] Unknown users become Pending.
- [ ] Admin approval works.
- [ ] Multiple identities can be explicitly linked to one SensorSphere user.
- [ ] Backend role enforcement has been tested.

## Official references

Google:

- https://support.google.com/cloud/answer/15544987
- https://support.google.com/cloud/answer/15549049
- https://support.google.com/cloud/answer/15549257
- https://support.google.com/cloud/answer/15549945
- https://developers.google.com/identity/protocols/oauth2/web-server

Microsoft:

- https://learn.microsoft.com/entra/identity-platform/v2-protocols-oidc
- https://learn.microsoft.com/entra/identity-platform/how-to-add-redirect-uri
- https://learn.microsoft.com/entra/identity-platform/reply-url
- https://learn.microsoft.com/graph/auth-register-app-v2
