// tokenStore — local persistence for the current Silpo OAuth token set.
//
// Pragmatic, hackathon-appropriate: a single JSON file under data/, mode
// 0600 where the OS supports it, never checked into git (see .gitignore).
// Single-user, single-process app — no encryption-at-rest, no session
// framework; this is NOT a pattern to reuse for a multi-tenant product.
//
// Never log token values anywhere in this module.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
// Overridable so tests can point this at an isolated file instead of the
// real production token — see the "why" note below. Never overridden in
// normal `npm start` operation.
const TOKEN_FILE = process.env.SILPO_OAUTH_TOKEN_FILE || path.join(DATA_DIR, 'silpo-oauth.json');

// WHY THIS IS OVERRIDABLE (real incident, not speculative): two test files
// (silpoTokenStore.test.js, silpoMcpClientAuth.test.js) used to each
// rename-away the real data/silpo-oauth.json to their own backup file at
// module-import time and rename it back in `test.after`. Node's test runner
// loads multiple test files concurrently by default, so both files' guard
// checks (`if existsSync(TOKEN_FILE) rename to backup`) raced: only the
// first file to import actually captured the real token; the second saw it
// already moved and skipped its own backup, then happily clobbered/cleared
// TOKEN_FILE with dummy test tokens and never restored the real one. This
// silently deleted a real, just-connected live Silpo OAuth token during
// `npm test`. Fix: tests now set SILPO_OAUTH_TOKEN_FILE to a private temp
// path before importing this module, so they can never touch the real file
// at all — no backup/restore dance, no race, no possibility of repeating
// this failure mode.

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readRaw() {
  ensureDir();
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRaw(obj) {
  ensureDir();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(TOKEN_FILE, 0o600);
  } catch {
    // best-effort — not all filesystems (e.g. some Windows setups) support this
  }
}

/**
 * @returns {null | {accessToken, refreshToken, expiresAt, tokenType, clientId, scope, connectedAt}}
 */
export function getToken() {
  return readRaw();
}

/**
 * Persist a token set. Only the fields listed below are ever written —
 * callers should not pass raw provider responses through unmodified.
 */
export function setToken({ accessToken, refreshToken, expiresAt, tokenType, clientId, scope, connectedAt }) {
  const existing = readRaw() || {};
  const next = {
    accessToken,
    refreshToken: refreshToken ?? existing.refreshToken ?? null,
    expiresAt,
    tokenType: tokenType || 'Bearer',
    clientId: clientId ?? existing.clientId ?? null,
    scope: scope ?? existing.scope ?? null,
    connectedAt: connectedAt || existing.connectedAt || new Date().toISOString()
  };
  writeRaw(next);
  return next;
}

export function clearToken() {
  ensureDir();
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
  }
}

/**
 * @param {number} skewSeconds treat a token as expired this many seconds
 *   before its actual expiry, so we refresh proactively.
 */
export function isExpired(skewSeconds = 60) {
  const token = readRaw();
  if (!token || !token.accessToken || !token.expiresAt) return true;
  return Date.now() >= token.expiresAt - skewSeconds * 1000;
}
