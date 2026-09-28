import {
  createHash,
  createPublicKey,
  randomBytes,
  verify
} from "node:crypto";

export type OidcProvider = "google" | "microsoft";

type OidcMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type JwtHeader = {
  alg?: string;
  kid?: string;
};

export type OidcClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  sub?: string;
  oid?: string;
  tid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
};

const metadataCache =
  new Map<string, {
    expiresAt: number;
    value: OidcMetadata;
  }>();

const jwksCache =
  new Map<string, {
    expiresAt: number;
    value: { keys: JsonWebKey[] };
  }>();

export const randomToken = (bytes = 32): string =>
  randomBytes(bytes).toString("base64url");

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function providerConfiguration(provider: OidcProvider) {
  const publicUrl =
    process.env.SENSORSPHERE_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";

  if (!publicUrl) {
    throw new Error("SENSORSPHERE_PUBLIC_URL is required for OIDC");
  }

  if (provider === "google") {
    const clientId = process.env.SENSORSPHERE_GOOGLE_CLIENT_ID?.trim() ?? "";
    const clientSecret =
      process.env.SENSORSPHERE_GOOGLE_CLIENT_SECRET?.trim() ?? "";

    if (!clientId || !clientSecret) {
      throw new Error("Google OIDC credentials are not configured");
    }

    return {
      provider,
      clientId,
      clientSecret,
      discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
      redirectUri: `${publicUrl}/api/v1/auth/oidc/google/callback`,
      scope: "openid email profile"
    };
  }

  const clientId = process.env.SENSORSPHERE_MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret =
    process.env.SENSORSPHERE_MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  const tenant =
    process.env.SENSORSPHERE_MICROSOFT_TENANT?.trim() || "common";

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OIDC credentials are not configured");
  }

  return {
    provider,
    clientId,
    clientSecret,
    tenant,
    discoveryUrl:
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`,
    redirectUri: `${publicUrl}/api/v1/auth/oidc/microsoft/callback`,
    scope: "openid email profile"
  };
}

async function readCachedJson<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  url: string
): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`OIDC metadata request failed: HTTP ${response.status}`);
  }

  const value = await response.json() as T;
  cache.set(url, {
    expiresAt: Date.now() + 60 * 60 * 1000,
    value
  });
  return value;
}

export async function getMetadata(provider: OidcProvider) {
  const config = providerConfiguration(provider);
  const metadata =
    await readCachedJson<OidcMetadata>(metadataCache, config.discoveryUrl);
  return { config, metadata };
}

function decodePart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function audienceMatches(
  audience: string | string[] | undefined,
  clientId: string
): boolean {
  if (typeof audience === "string") return audience === clientId;
  return Array.isArray(audience) && audience.includes(clientId);
}

function validateIssuer(
  provider: OidcProvider,
  claims: OidcClaims,
  metadata: OidcMetadata,
  configuredTenant?: string
): void {
  if (provider === "google") {
    if (claims.iss !== metadata.issuer) {
      throw new Error("OIDC issuer mismatch");
    }
    return;
  }

  const tid = claims.tid;
  if (!tid) throw new Error("Microsoft token is missing tid");

  if (
    configuredTenant &&
    !["common", "organizations", "consumers"].includes(configuredTenant) &&
    tid.toLowerCase() !== configuredTenant.toLowerCase()
  ) {
    throw new Error("Microsoft tenant mismatch");
  }

  const expected = `https://login.microsoftonline.com/${tid}/v2.0`;
  if (claims.iss !== expected) {
    throw new Error("Microsoft OIDC issuer mismatch");
  }
}

export async function exchangeAndValidateIdToken(
  provider: OidcProvider,
  code: string,
  expectedNonce: string
): Promise<OidcClaims> {
  const { config, metadata } = await getMetadata(provider);

  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`OIDC token exchange failed: HTTP ${tokenResponse.status}`);
  }

  const tokenPayload = await tokenResponse.json() as {
    id_token?: string;
  };
  if (!tokenPayload.id_token) {
    throw new Error("OIDC provider did not return an id_token");
  }

  const parts = tokenPayload.id_token.split(".");
  if (parts.length !== 3) throw new Error("Malformed OIDC id_token");

  const header = decodePart<JwtHeader>(parts[0]);
  const claims = decodePart<OidcClaims>(parts[1]);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported OIDC token signing algorithm");
  }

  const jwks =
    await readCachedJson<{ keys: JsonWebKey[] }>(jwksCache, metadata.jwks_uri);
  const jwk = jwks.keys.find(key => (key as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!jwk) throw new Error("OIDC signing key not found");

  const key = createPublicKey({
    key: jwk as import("node:crypto").JsonWebKey,
    format: "jwk"
  });
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url")
  );
  if (!valid) throw new Error("Invalid OIDC id_token signature");

  if (!audienceMatches(claims.aud, config.clientId)) {
    throw new Error("OIDC audience mismatch");
  }
  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    throw new Error("OIDC id_token has expired");
  }
  if (!claims.nonce || claims.nonce !== expectedNonce) {
    throw new Error("OIDC nonce mismatch");
  }

  validateIssuer(
    provider,
    claims,
    metadata,
    "tenant" in config ? config.tenant : undefined
  );

  return claims;
}

export async function buildAuthorizationUrl(
  provider: OidcProvider,
  state: string,
  nonce: string
): Promise<string> {
  const { config, metadata } = await getMetadata(provider);
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("response_mode", "query");
  return url.toString();
}
