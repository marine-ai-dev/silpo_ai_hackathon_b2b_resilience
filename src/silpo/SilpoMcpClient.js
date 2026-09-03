// SilpoMcpClient — real MCP client over Streamable HTTP, connecting to
// process.env.SILPO_MCP_URL (default https://mcp.silpo.ua/mcp).
//
// Method names/params/response shapes map 1:1 to the real tools documented
// in docs/silpo-mcp-audit/tool-inventory.json and 02-tools-inventory.md.
//
// Auth: this app owns its own OAuth 2.1 + PKCE client (see
// src/silpo/oauth/SilpoOAuthClient.js + tokenStore.js) — it is independent
// of Claude Code's own MCP session. The current access token is read from
// tokenStore and injected as `Authorization: Bearer <token>` via a custom
// fetch passed to StreamableHTTPClientTransport (the SDK's requestInit/
// fetch option — see node_modules/@modelcontextprotocol/sdk transport
// types), rather than hand-rolling a full OAuthClientProvider.
//
// If no token is present, calls fail fast with SilpoNotConnectedError so
// SilpoGateway can present a clean "not connected" state instead of a raw
// crash. If a call comes back 401 (token expired/revoked), we attempt
// exactly one refresh-and-retry before giving up and clearing the token.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SilpoOAuthClient } from './oauth/SilpoOAuthClient.js';
import * as tokenStore from './oauth/tokenStore.js';

const DEFAULT_URL = 'https://mcp.silpo.ua/mcp';

export class SilpoNotConnectedError extends Error {
  constructor(message = 'Silpo is not connected. Visit /api/silpo/connect to authorize.') {
    super(message);
    this.name = 'SilpoNotConnectedError';
    this.code = 'SILPO_NOT_CONNECTED';
  }
}

function firstJson(result) {
  // MCP tool results come back as { content: [{type:'text', text: '...'}] }
  // (or similar) — normalize to a parsed JS value.
  const textBlock = result?.content?.find((c) => c.type === 'text');
  if (!textBlock) return result;
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return textBlock.text;
  }
}

function isUnauthorizedError(err) {
  const msg = String(err?.message || '');
  return err?.status === 401 || err?.code === 401 || /\b401\b/.test(msg) || /invalid_token|unauthorized/i.test(msg);
}

export class SilpoMcpClient {
  // `connectFn` is a test seam: by default we build a real
  // Client+StreamableHTTPClientTransport pair, but tests can inject a fake
  // async () => ({ callTool }) to exercise the 401/refresh/retry logic
  // without ever touching the network.
  constructor({
    url = process.env.SILPO_MCP_URL || DEFAULT_URL,
    oauthClient = new SilpoOAuthClient(),
    connectFn = null
  } = {}) {
    this.mode = 'live';
    this.url = url;
    this._oauthClient = oauthClient;
    this._connectFn = connectFn || (() => this._connectWithCurrentToken());
    this._client = null;
    this._connecting = null;
    this._connectedTokenSignature = null; // bound to the access token used for the live connection
  }

  _authorizedFetch = async (input, init = {}) => {
    const token = tokenStore.getToken();
    const headers = new Headers(init.headers || {});
    if (token?.accessToken) {
      // mcp.silpo.ua requires the exact scheme casing "Bearer" (RFC 6750 §2.1
      // treats it as case-sensitive at the wire level for this server, even
      // though the token endpoint itself returns token_type: "bearer"
      // lowercase). Always normalize to "Bearer" regardless of what the
      // token response said, rather than trusting token_type verbatim.
      headers.set('Authorization', `Bearer ${token.accessToken}`);
    }
    return fetch(input, { ...init, headers });
  };

  async _freshTransport() {
    return new StreamableHTTPClientTransport(new URL(this.url), {
      fetch: this._authorizedFetch
    });
  }

  async _connectWithCurrentToken() {
    const client = new Client({ name: 'silpo-office-procurement-mvp', version: '0.1.0' });
    const transport = await this._freshTransport();
    await client.connect(transport);
    return client;
  }

  async _ensureConnected() {
    const token = tokenStore.getToken();
    if (!token?.accessToken) {
      throw new SilpoNotConnectedError();
    }
    if (this._client && this._connectedTokenSignature === token.accessToken) {
      return this._client;
    }
    if (!this._connecting) {
      this._connecting = this._connectFn()
        .then((client) => {
          this._client = client;
          this._connectedTokenSignature = token.accessToken;
          this._connecting = null;
          return client;
        })
        .catch((err) => {
          this._connecting = null;
          console.error(`[SilpoMcpClient] failed to connect to ${this.url}:`, err.message);
          throw err;
        });
    }
    return this._connecting;
  }

  async _refreshAndRetryOnce() {
    const token = tokenStore.getToken();
    if (!token?.refreshToken) {
      tokenStore.clearToken();
      throw new SilpoNotConnectedError('Silpo session expired and no refresh token is available. Reconnect via /api/silpo/connect.');
    }
    try {
      const refreshed = await this._oauthClient.refresh(token.refreshToken);
      tokenStore.setToken({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
        tokenType: refreshed.token_type,
        clientId: token.clientId,
        scope: token.scope,
        connectedAt: token.connectedAt
      });
      // force a fresh connection bound to the new token
      this._client = null;
      this._connectedTokenSignature = null;
    } catch (err) {
      tokenStore.clearToken();
      this._client = null;
      this._connectedTokenSignature = null;
      throw new SilpoNotConnectedError('Silpo token refresh failed. Reconnect via /api/silpo/connect.');
    }
  }

  async _call(toolName, args = {}) {
    try {
      const client = await this._ensureConnected();
      const result = await client.callTool({ name: toolName, arguments: args });
      return firstJson(result);
    } catch (err) {
      if (err instanceof SilpoNotConnectedError) throw err;
      if (isUnauthorizedError(err)) {
        console.error(`[SilpoMcpClient] tool call unauthorized: ${toolName} — attempting one refresh+retry`);
        await this._refreshAndRetryOnce();
        try {
          const client = await this._ensureConnected();
          const result = await client.callTool({ name: toolName, arguments: args });
          return firstJson(result);
        } catch (retryErr) {
          console.error(`[SilpoMcpClient] tool call failed after refresh retry: ${toolName}`, retryErr.message);
          throw retryErr;
        }
      }
      console.error(`[SilpoMcpClient] tool call failed: ${toolName}`, err.message);
      throw err;
    }
  }

  // ---- Cart ----
  async getMyShoppingCart() {
    return this._call('silpo_get_my_shopping_cart');
  }

  async createShoppingCart(args) {
    return this._call('silpo_create_shopping_cart', args);
  }

  async getShoppingCartById({ shoppingCartId }) {
    return this._call('silpo_get_shopping_cart_by_id', { shoppingCartId });
  }

  // ---- Delivery ----
  async getAvailableDeliveryTypes({ latitude, longitude }) {
    return this._call('silpo_get_available_delivery_types', { latitude, longitude });
  }

  async getTimeSlots(args) {
    return this._call('silpo_get_time_slots', args);
  }

  async findAddress({ address }) {
    return this._call('silpo_find_address', { address });
  }

  // ---- Catalog ----
  async getCategoriesTree(args) {
    return this._call('silpo_get_categories_tree', args);
  }

  async getProducts(args) {
    return this._call('silpo_get_products', args);
  }

  async findProductsBatch(args) {
    return this._call('silpo_find_products_batch', args);
  }

  // ---- Optimization signals ----
  async getPromotions(args) {
    return this._call('silpo_get_promotions', args);
  }

  async getReplacements(args) {
    return this._call('silpo_get_replacements', args);
  }

  // ---- Cart writes (ONLY ever called from cartPreparationService, gated
  // on ProcurementProposal/Run status === APPROVED) ----
  async addOrUpdateCartProducts(args) {
    return this._call('silpo_add_or_update_cart_products', args);
  }

  async removeCartProducts(args) {
    return this._call('silpo_remove_cart_products', args);
  }

  async updateShoppingCart(args) {
    return this._call('silpo_update_shopping_cart', args);
  }
}
