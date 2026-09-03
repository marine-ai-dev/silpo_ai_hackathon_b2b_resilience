# SILPO_OAUTH.md — the app's own OAuth 2.1 + PKCE client for Silpo

This app owns its Silpo authentication lifecycle end to end. It is a
standards-compliant OAuth 2.1 public client, independent of Claude Code's
own MCP session — nothing about live mode depends on this process running
inside an authenticated `claude mcp` context anymore.

## Why this exists

The previous version of this integration (see the superseded note in
`MCP_INTEGRATION.md`'s history) assumed the MCP endpoint was already
authenticated by whatever environment ran the process. That's fine inside
an interactive Claude Code session but is not how a real, deployable app
gets a Silpo token. This module makes the app itself do Dynamic Client
Registration, build PKCE-protected authorization URLs, exchange codes for
tokens, and refresh them — exactly what any real OAuth 2.1 client does.

## Discovered endpoints (verified live against `mcp.silpo.ua`)

```
GET https://mcp.silpo.ua/.well-known/oauth-authorization-server
→ {
    "issuer": "https://mcp.silpo.ua",
    "authorization_endpoint": "https://mcp.silpo.ua/authorize",
    "token_endpoint": "https://mcp.silpo.ua/token",
    "registration_endpoint": "https://mcp.silpo.ua/register",
    "response_types_supported": ["code"],
    "response_modes_supported": ["query"],
    "grant_types_supported": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
    "revocation_endpoint": "https://mcp.silpo.ua/token",
    "code_challenge_methods_supported": ["plain", "S256"],
    "client_id_metadata_document_supported": false
  }

GET https://mcp.silpo.ua/.well-known/oauth-protected-resource/mcp
→ {
    "resource": "https://mcp.silpo.ua/mcp",
    "authorization_servers": ["https://mcp.silpo.ua"],
    "bearer_methods_supported": ["header"]
  }
```

Both are cached in-memory for 10 minutes (`SilpoOAuthClient.discover()`) so
we don't hit them on every request.

## Client registration (DCR)

`POST https://mcp.silpo.ua/register` with:

```json
{
  "redirect_uris": ["http://127.0.0.1:3000/api/silpo/oauth/callback"],
  "client_name": "Silpo Office Procurement MVP",
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

returns `201` with a `client_id` and no `client_secret` — a **public
client**, exactly right for a locally-run app using PKCE for proof of
possession instead of a confidential secret. The redirect URI's base comes
from `PUBLIC_BASE_URL` (default `http://127.0.0.1:3000`), configurable via
env for a different host/port.

Registration happens **once** and is persisted to
`data/silpo-oauth-client.json` (gitignored) so the app doesn't re-register
with Silpo on every restart. `SilpoOAuthClient.ensureClientRegistration()`
checks that file first and only calls `/register` again if it's missing or
the configured redirect URI changed.

## Authorization + PKCE

`SilpoOAuthClient.buildAuthorizationUrl()`:

1. Generates a random `code_verifier` (43–128 chars, base64url).
2. Derives `code_challenge = base64url(sha256(code_verifier))` (S256, the
   stronger of the two methods Silpo advertises).
3. Generates a random `state`.
4. Stores `{state → {codeVerifier, createdAt}}` in an in-memory `Map`
   (10-minute TTL — plenty for a human to complete a login). This is a
   deliberately simple choice for a single-user local hackathon app; a
   multi-user deployment would need a real session store instead.
5. Returns the full `GET /authorize?...` URL.

Visiting that URL takes the browser to `auth.silpo.ua` — **real Silpo
account login** (credentials/OTP). Only a human with a real Silpo account
can complete this step; nothing in this codebase can or should automate
it.

## Callback + token exchange

`GET /api/silpo/oauth/callback?code=...&state=...`:

1. `handleCallback({code, state})` looks up the pending `state`. An
   unknown, already-used, or expired `state` is rejected outright — this
   is the CSRF/replay protection PKCE + `state` together provide.
2. Exchanges the code at `POST /token` with `grant_type=authorization_code`,
   `code`, `redirect_uri`, `client_id`, and `code_verifier` (no client
   secret — `token_endpoint_auth_method` is `none`, so `code_verifier` is
   the actual proof of possession).
3. On success, the route stores the resulting token set via `tokenStore`
   and redirects the browser back to `/?silpo=connected`. On any failure it
   redirects to `/?silpo=error&reason=...` — the browser never sees a raw
   token or a stack trace.

## Token lifecycle

- **Storage**: `data/silpo-oauth.json` (gitignored), file mode `0600` where
  supported — `{accessToken, refreshToken, expiresAt, tokenType, clientId,
  scope, connectedAt}`.
- **Refresh**: `SilpoMcpClient` reads the token from `tokenStore` on every
  call. If a tool call comes back `401`, it calls
  `SilpoOAuthClient.refresh(refreshToken)` exactly once, persists the new
  token, and retries the call once. If refresh also fails, the token is
  cleared and a `SilpoNotConnectedError` is surfaced — never a raw crash.
- **Disconnect**: `POST /api/silpo/disconnect` calls `tokenStore.clearToken()`.

## Security boundary

- The browser never receives a token value — only `{connected: boolean,
  expiresAt, connectedAt}` from `GET /api/silpo/status`.
- Token values are never logged. Every log line in
  `SilpoOAuthClient`/`SilpoMcpClient` says "token acquired" / "refreshed" /
  "connected" — never the string itself.
- `data/silpo-oauth.json` and `data/silpo-oauth-client.json` are both
  gitignored; nothing OAuth-related is ever meant to be committed.
- This app's write access to Silpo is still hard-gated exactly as before:
  only `cartPreparationService`, only on an `approved` proposal — OAuth
  changes *how we authenticate*, not *what we're allowed to do* once
  authenticated.

## Demo recovery

If live OAuth breaks, or there's no network access, during a demo: set
`SILPO_MODE=mock` (or just don't set `SILPO_MODE` — mock is the default)
and restart. No code change needed. The UI is identical; every proposal
and line item is visibly tagged `mock` via the `dataSource`/`sourceMode`
provenance fields instead of `live`, so nobody mistakes fixture data for
real Silpo data.
