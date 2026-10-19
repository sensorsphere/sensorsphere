# NET-OAUTH-REAL-01 — Real Netatmo OAuth compatibility and safe diagnostics

## Prior diagnosis
Connection `homefcs-01` uses `https://api.netatmo.com`; callback `https://dev.sensorsphere.f-colas.com/api/v1/integrations/netatmo/connections/callback` confirmed by user. Failed OAuth attempt was previously reduced to a generic simulator-oriented message. No secret values or OAuth tokens were inspected or output.

## Fix
- Authorization-code exchange includes exact requested `scope`: read-only for real and SIM-01, read/write for approved SIM-02.
- Accept either string or list of strings for token scopes, normalizing to space-separated permissions.
- Exchange error is typed and includes only HTTP status and recognized safe OAuth error code, never provider response descriptions, codes, tokens, client secret, or payload.
- Connection's `oauth_last_error` now retains diagnostic phase, status and safe code instead of simulator-specific message. API response provides `phase`, `category`, `httpStatus`, `oauthCode` with no sensitive values. Logs include connection ID and sanitized metadata only.
- Network errors and malformed provider responses distinguished. Real connection remains read-only, server-side SIM-02 command lock unchanged.

## Validation
- API Docker build: PASS.
- Targeted OAuth tests: 7/7 PASS (scopes, safe error handling, tokens and refresh).
- Did not initiate real OAuth or send thermostat commands. A fresh administrator-initiated OAuth authorization is needed to verify the real provider response.
- DEV only; no TEST1, no secrets logged, no push.
