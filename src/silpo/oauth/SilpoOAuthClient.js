// SilpoOAuthClient — a small, self-contained OAuth 2.1 + PKCE client for
// mcp.silpo.ua. This app owns its own client registration and token
// lifecycle; it does NOT depend on Claude Code's own MCP session/auth.
//
// Discovered endpoints (verified live, see docs/b2b-mvp/SILPO_OAUTH.md):
//   GET  https://mcp.silpo.ua/.well-known/oauth-authorization-server
//   GET  https://mcp.silpo.ua/.well-known/oauth-protected-resource/mcp
//   POST https://mcp.silpo.ua/register   (Dynamic Client Registration)
//   GET  https://mcp.silpo.ua/authorize  (real Silpo login, human-only)
//   POST https://mcp.silpo.ua/token      (authorization_code / refresh_token)
//
// Never log token values — only booleans/lengths/status words.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const CLIENT_REG_FILE = path.join(DATA_DIR, 'silpo-oauth-client.json');

const ISSUER = process.env.SILPO_MCP_ISSUER || 'https://mcp.silpo.ua';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3000';
const CALLBACK_PATH = '/api/silpo/oauth/callback';

const DISCOVERY_TTL_MS = 10 * 60 * 1000; // 10 min
const PENDING_STATE_TTL_MS = 10 * 60 * 1000; // 10 min — plenty for a human to log in

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readClientReg() {
  ensureDir();
  if (!fs.existsSync(CLIENT_REG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CLIENT_REG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeClientReg(reg) {
  ensureDir();
  fs.writeFileSync(CLIENT_REG_FILE, JSON.stringify(reg, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(CLIENT_REG_FILE, 0o600);
  } catch {
    // best-effort
  }
}

// base64url per RFC 7636
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
  // 43-128 chars of unreserved characters — 64 random bytes -> base64url is ~86 chars.
  return base64url(crypto.randomBytes(64));
}

function codeChallengeS256(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

function generateState() {
  return base64url(crypto.randomBytes(24));
}

export class SilpoOAuthClient {
  constructor({ fetchImpl = fetch } = {}) {
    this._fetch = fetchImpl;
    this._discoveryCache = null; // { doc, protectedResource, fetchedAt }
    this._pending = new Map(); // state -> { codeVerifier, createdAt }
  }

  get redirectUri() {
    return `${PUBLIC_BASE_URL}${CALLBACK_PATH}`;
  }

  async discover() {
    if (this._discoveryCache && Date.now() - this._discoveryCache.fetchedAt < DISCOVERY_TTL_MS) {
      return this._discoveryCache;
    }
    const [asRes, prRes] = await Promise.all([
      this._fetch(`${ISSUER}/.well-known/oauth-authorization-server`),
      this._fetch(`${ISSUER}/.well-known/oauth-protected-resource/mcp`)
    ]);
    if (!asRes.ok) throw new Error(`Silpo OAuth discovery failed: authorization-server metadata ${asRes.status}`);
    const doc = await asRes.json();
    const protectedResource = prRes.ok ? await prRes.json() : null;
    this._discoveryCache = { doc, protectedResource, fetchedAt: Date.now() };
    return this._discoveryCache;
  }

  async ensureClientRegistration() {
    const existing = readClientReg();
    if (existing?.client_id && existing.redirect_uri === this.redirectUri) {
      return existing;
    }
    const { doc } = await this.discover();
    if (!doc.registration_endpoint) {
      throw new Error('Silpo OAuth server does not advertise a registration_endpoint');
    }
    const res = await this._fetch(doc.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: [this.redirectUri],
        client_name: 'Silpo Office Procurement MVP',
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code']
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Silpo DCR failed: ${res.status} ${body}`);
    }
    const reg = await res.json();
    const record = {
      client_id: reg.client_id,
      redirect_uri: this.redirectUri,
      registration_client_uri: reg.registration_client_uri || null,
      registration_access_token: reg.registration_access_token || null,
      token_endpoint_auth_method: reg.token_endpoint_auth_method || 'none',
      registeredAt: new Date().toISOString()
    };
    writeClientReg(record);
    console.log('[SilpoOAuthClient] dynamic client registration complete (client_id acquired).');
    return record;
  }

  _cleanupExpiredPending() {
    const now = Date.now();
    for (const [state, entry] of this._pending) {
      if (now - entry.createdAt > PENDING_STATE_TTL_MS) this._pending.delete(state);
    }
  }

  async buildAuthorizationUrl() {
    this._cleanupExpiredPending();
    const { doc } = await this.discover();
    const clientReg = await this.ensureClientRegistration();

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeS256(codeVerifier);
    const state = generateState();

    this._pending.set(state, { codeVerifier, createdAt: Date.now() });

    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientReg.client_id);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', '');

    return url.toString();
  }

  async handleCallback({ code, state }) {
    this._cleanupExpiredPending();
    if (!code || !state) throw new Error('Missing code or state on Silpo OAuth callback');

    const pending = this._pending.get(state);
    if (!pending) {
      throw new Error('Unknown, reused, or expired OAuth state');
    }
    this._pending.delete(state); // one-time use, whether this succeeds or not

    const { doc } = await this.discover();
    const clientReg = await this.ensureClientRegistration();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: clientReg.client_id,
      code_verifier: pending.codeVerifier
    });

    const res = await this._fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Silpo token exchange failed: ${res.status} ${errBody}`);
    }
    const json = await res.json();
    console.log('[SilpoOAuthClient] token acquired.');
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
      token_type: json.token_type || 'Bearer'
    };
  }

  async refresh(refreshToken) {
    if (!refreshToken) throw new Error('No refresh token available');
    const { doc } = await this.discover();
    const clientReg = await this.ensureClientRegistration();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientReg.client_id
    });

    const res = await this._fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Silpo token refresh failed: ${res.status} ${errBody}`);
    }
    const json = await res.json();
    console.log('[SilpoOAuthClient] token refreshed.');
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token || refreshToken,
      expires_in: json.expires_in,
      token_type: json.token_type || 'Bearer'
    };
  }
}

// Exported for tests that need deterministic PKCE without spinning up the
// whole class (kept pure/side-effect-free).
export const _internal = { base64url, generateCodeVerifier, codeChallengeS256, generateState };
