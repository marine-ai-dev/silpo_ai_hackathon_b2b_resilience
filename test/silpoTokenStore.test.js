import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Point tokenStore at a private temp file BEFORE importing it, so this test
// never reads/writes the real data/silpo-oauth.json. Previously this used a
// rename-the-real-file-away-and-restore-it scheme, which raced with the
// identical scheme in silpoMcpClientAuth.test.js under `node --test`'s
// concurrent file execution and once deleted a real, just-connected live
// token — see the comment in src/silpo/oauth/tokenStore.js for the story.
const TOKEN_FILE = path.join(os.tmpdir(), `silpo-oauth-test-${crypto.randomUUID()}.json`);
process.env.SILPO_OAUTH_TOKEN_FILE = TOKEN_FILE;

const tokenStore = await import('../src/silpo/oauth/tokenStore.js');

test.afterEach(() => {
  tokenStore.clearToken();
});

test.after(() => {
  tokenStore.clearToken();
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
});

test('round-trip save/load', () => {
  assert.equal(tokenStore.getToken(), null);
  tokenStore.setToken({
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    expiresAt: Date.now() + 60_000,
    tokenType: 'Bearer',
    clientId: 'client-1',
    scope: null,
    connectedAt: new Date().toISOString()
  });
  const loaded = tokenStore.getToken();
  assert.equal(loaded.accessToken, 'at-1');
  assert.equal(loaded.refreshToken, 'rt-1');
  assert.equal(loaded.clientId, 'client-1');
});

test('isExpired() correctness around the boundary', () => {
  tokenStore.setToken({ accessToken: 'at-2', refreshToken: 'rt-2', expiresAt: Date.now() + 120_000 });
  assert.equal(tokenStore.isExpired(60), false, 'token expiring in 2 min should not be expired with a 60s skew');

  tokenStore.setToken({ accessToken: 'at-3', refreshToken: 'rt-3', expiresAt: Date.now() + 30_000 });
  assert.equal(tokenStore.isExpired(60), true, 'token expiring in 30s should be considered expired with a 60s skew');

  tokenStore.clearToken();
  assert.equal(tokenStore.isExpired(), true, 'no token at all is always expired');
});

test('clearToken() removes the token', () => {
  tokenStore.setToken({ accessToken: 'at-4', refreshToken: 'rt-4', expiresAt: Date.now() + 60_000 });
  assert.ok(tokenStore.getToken());
  tokenStore.clearToken();
  assert.equal(tokenStore.getToken(), null);
});
