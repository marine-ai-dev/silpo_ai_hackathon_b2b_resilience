import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SilpoOAuthClient, _internal } from '../src/silpo/oauth/SilpoOAuthClient.js';

// SilpoOAuthClient persists DCR results to data/silpo-oauth-client.json on
// disk (so real runs don't re-register on every restart). Isolate the test
// suite from any real registration on this machine: back it up, wipe it
// before each test in this file, restore it afterwards.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_REG_FILE = path.join(__dirname, '..', 'data', 'silpo-oauth-client.json');
const BACKUP_FILE = CLIENT_REG_FILE + '.oauth-test-backup';

if (fs.existsSync(CLIENT_REG_FILE)) fs.renameSync(CLIENT_REG_FILE, BACKUP_FILE);

function wipeClientReg() {
  if (fs.existsSync(CLIENT_REG_FILE)) fs.unlinkSync(CLIENT_REG_FILE);
}

test.beforeEach(() => wipeClientReg());

test.after(() => {
  wipeClientReg();
  if (fs.existsSync(BACKUP_FILE)) fs.renameSync(BACKUP_FILE, CLIENT_REG_FILE);
});

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeFetchFactory({ registerClientId = 'client-abc' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/.well-known/oauth-authorization-server')) {
      return {
        ok: true,
        json: async () => ({
          issuer: 'https://mcp.silpo.ua',
          authorization_endpoint: 'https://mcp.silpo.ua/authorize',
          token_endpoint: 'https://mcp.silpo.ua/token',
          registration_endpoint: 'https://mcp.silpo.ua/register',
          code_challenge_methods_supported: ['S256']
        })
      };
    }
    if (u.endsWith('/.well-known/oauth-protected-resource/mcp')) {
      return { ok: true, json: async () => ({ resource: 'https://mcp.silpo.ua/mcp', authorization_servers: ['https://mcp.silpo.ua'] }) };
    }
    if (u.endsWith('/register')) {
      return { ok: true, json: async () => ({ client_id: registerClientId, redirect_uris: [], token_endpoint_auth_method: 'none' }) };
    }
    if (u.endsWith('/token')) {
      return { ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, token_type: 'Bearer' }) };
    }
    throw new Error(`unexpected fetch to ${u}`);
  };
  return { fetchImpl, calls };
}

test('PKCE: code_verifier length/charset and S256 challenge match an independent computation', () => {
  const verifier = _internal.generateCodeVerifier();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier length ${verifier.length} out of range`);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);

  const challenge = _internal.codeChallengeS256(verifier);
  const expected = base64url(crypto.createHash('sha256').update(verifier).digest());
  assert.equal(challenge, expected);
});

test('state store: a valid, unused state is accepted exactly once', async () => {
  const { fetchImpl } = fakeFetchFactory();
  const client = new SilpoOAuthClient({ fetchImpl });
  const url = await client.buildAuthorizationUrl();
  const state = new URL(url).searchParams.get('state');
  assert.ok(state);

  const tokens = await client.handleCallback({ code: 'the-code', state });
  assert.equal(tokens.access_token, 'AT');
  assert.equal(tokens.refresh_token, 'RT');
});

test('state store: reused state is rejected', async () => {
  const { fetchImpl } = fakeFetchFactory();
  const client = new SilpoOAuthClient({ fetchImpl });
  const url = await client.buildAuthorizationUrl();
  const state = new URL(url).searchParams.get('state');

  await client.handleCallback({ code: 'code-1', state });
  await assert.rejects(() => client.handleCallback({ code: 'code-2', state }), /state/i);
});

test('state store: unknown state is rejected', async () => {
  const { fetchImpl } = fakeFetchFactory();
  const client = new SilpoOAuthClient({ fetchImpl });
  await assert.rejects(() => client.handleCallback({ code: 'code-x', state: 'never-issued' }), /state/i);
});

test('state store: expired state is rejected', async () => {
  const { fetchImpl } = fakeFetchFactory();
  const client = new SilpoOAuthClient({ fetchImpl });
  const url = await client.buildAuthorizationUrl();
  const state = new URL(url).searchParams.get('state');

  // Reach into the pending map to simulate time passing beyond the TTL,
  // without needing a real 10-minute sleep in the test suite.
  const entry = client._pending.get(state);
  entry.createdAt = Date.now() - 11 * 60 * 1000;

  await assert.rejects(() => client.handleCallback({ code: 'code-late', state }), /state/i);
});

test('ensureClientRegistration performs DCR once and persists client_id (no network re-registration on repeat calls within the same instance)', async () => {
  let registerCalls = 0;
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/.well-known/oauth-authorization-server')) {
      return { ok: true, json: async () => ({ authorization_endpoint: 'https://mcp.silpo.ua/authorize', token_endpoint: 'https://mcp.silpo.ua/token', registration_endpoint: 'https://mcp.silpo.ua/register' }) };
    }
    if (u.endsWith('/.well-known/oauth-protected-resource/mcp')) {
      return { ok: true, json: async () => ({}) };
    }
    if (u.endsWith('/register')) {
      registerCalls += 1;
      return { ok: true, json: async () => ({ client_id: 'client-once' }) };
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  const client = new SilpoOAuthClient({ fetchImpl });
  const reg1 = await client.ensureClientRegistration();
  const reg2 = await client.ensureClientRegistration();
  assert.equal(reg1.client_id, 'client-once');
  assert.equal(reg2.client_id, 'client-once');
  assert.equal(registerCalls, 1, 'DCR should not repeat once a client_id is persisted');
});
