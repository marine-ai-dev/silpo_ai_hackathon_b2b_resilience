// silpoAuth routes — the app's own OAuth 2.1 + PKCE lifecycle for Silpo,
// independent of Claude Code's MCP session. Mounted at /api/silpo/*
// alongside the main api router. The browser never sees a token value —
// only a connected/not-connected status.

import { Router } from 'express';
import { SilpoOAuthClient } from '../silpo/oauth/SilpoOAuthClient.js';
import * as tokenStore from '../silpo/oauth/tokenStore.js';

const oauthClient = new SilpoOAuthClient();

export function buildSilpoAuthRouter() {
  const router = Router();

  router.get('/status', (req, res) => {
    const token = tokenStore.getToken();
    const connected = !!token?.accessToken && !tokenStore.isExpired(0);
    res.json({
      connected,
      expiresAt: token?.expiresAt ?? null,
      connectedAt: token?.connectedAt ?? null
    });
  });

  router.get('/connect', async (req, res) => {
    try {
      const url = await oauthClient.buildAuthorizationUrl();
      res.redirect(302, url);
    } catch (err) {
      console.error('[silpoAuth] /connect failed:', err.message);
      res.redirect(302, `/?silpo=error&reason=${encodeURIComponent('connect_failed')}`);
    }
  });

  router.get('/oauth/callback', async (req, res) => {
    try {
      const { code, state, error } = req.query;
      if (error) {
        return res.redirect(302, `/?silpo=error&reason=${encodeURIComponent(String(error))}`);
      }
      const tokens = await oauthClient.handleCallback({ code: String(code || ''), state: String(state || '') });
      tokenStore.setToken({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        tokenType: tokens.token_type,
        connectedAt: new Date().toISOString()
      });
      console.log('[silpoAuth] Silpo connected.');
      res.redirect(302, '/?silpo=connected');
    } catch (err) {
      console.error('[silpoAuth] /oauth/callback failed:', err.message);
      res.redirect(302, `/?silpo=error&reason=${encodeURIComponent('callback_failed')}`);
    }
  });

  router.post('/disconnect', (req, res) => {
    tokenStore.clearToken();
    res.json({ connected: false });
  });

  return router;
}
