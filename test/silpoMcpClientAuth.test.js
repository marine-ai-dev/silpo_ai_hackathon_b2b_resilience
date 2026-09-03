import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Isolate this test's token writes from the real data/silpo-oauth.json by
// pointing tokenStore at a private temp file BEFORE importing it — never
// touch the real file at all. (Do not go back to a rename-away-and-restore
// backup scheme here: with multiple test files running concurrently under
// `node --test`, that previously raced and once deleted a real, just
// -connected live token. See the comment in src/silpo/oauth/tokenStore.js.)
const TOKEN_FILE = path.join(os.tmpdir(), `silpo-oauth-test-${crypto.randomUUID()}.json`);
process.env.SILPO_OAUTH_TOKEN_FILE = TOKEN_FILE;

const { SilpoMcpClient, SilpoNotConnectedError } = await import('../src/silpo/SilpoMcpClient.js');
const tokenStore = await import('../src/silpo/oauth/tokenStore.js');

test.afterEach(() => tokenStore.clearToken());
test.after(() => {
  tokenStore.clearToken();
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
});

function fakeOAuthClient({ refreshSucceeds = true } = {}) {
  return {
    async refresh(refreshToken) {
      if (!refreshSucceeds) throw new Error('refresh failed');
      return { access_token: 'fresh-access-token', refresh_token: refreshToken, expires_in: 3600, token_type: 'Bearer' };
    }
  };
}

test('SilpoMcpClient throws SilpoNotConnectedError when no token is stored', async () => {
  tokenStore.clearToken();
  const client = new SilpoMcpClient({ oauthClient: fakeOAuthClient(), connectFn: async () => { throw new Error('should not connect'); } });
  await assert.rejects(() => client.getMyShoppingCart(), SilpoNotConnectedError);
});

test('401 on a tool call triggers exactly one refresh + retry, which then succeeds', async () => {
  tokenStore.setToken({ accessToken: 'stale-token', refreshToken: 'refresh-1', expiresAt: Date.now() + 60_000 });

  let connectCount = 0;
  let callCount = 0;
  const connectFn = async () => {
    connectCount += 1;
    const boundToken = tokenStore.getToken()?.accessToken;
    return {
      async callTool() {
        callCount += 1;
        if (boundToken === 'stale-token') {
          const err = new Error('invalid_token: 401 Unauthorized');
          err.status = 401;
          throw err;
        }
        return { content: [{ type: 'text', text: JSON.stringify({ exists: true, shoppingCartId: 'cart-1' }) }] };
      }
    };
  };

  const client = new SilpoMcpClient({ oauthClient: fakeOAuthClient(), connectFn });
  const result = await client.getMyShoppingCart();
  assert.deepEqual(result, { exists: true, shoppingCartId: 'cart-1' });
  assert.equal(connectCount, 2, 'should reconnect once after refresh');

  const stored = tokenStore.getToken();
  assert.equal(stored.accessToken, 'fresh-access-token');
});

test('hard-fail path: refresh also fails -> token cleared, SilpoNotConnectedError surfaced', async () => {
  tokenStore.setToken({ accessToken: 'stale-token', refreshToken: 'refresh-1', expiresAt: Date.now() + 60_000 });

  const connectFn = async () => ({
    async callTool() {
      const err = new Error('invalid_token: 401 Unauthorized');
      err.status = 401;
      throw err;
    }
  });

  const client = new SilpoMcpClient({ oauthClient: fakeOAuthClient({ refreshSucceeds: false }), connectFn });
  await assert.rejects(() => client.getMyShoppingCart(), SilpoNotConnectedError);
  assert.equal(tokenStore.getToken(), null, 'token should be cleared after a failed refresh');
});
