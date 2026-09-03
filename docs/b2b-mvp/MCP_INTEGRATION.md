# MCP_INTEGRATION.md

## Client selection

`src/silpo/SilpoGateway.createSilpoClient()` reads `SILPO_MODE`
(`mock` default, or `live`) and returns either:

- `MockSilpoMcpClient` (`src/silpo/MockSilpoMcpClient.js`) — fixture data
  from `src/silpo/fixtures.js`, no network calls. Default so
  `npm install && npm start` always works.
- `SilpoMcpClient` (`src/silpo/SilpoMcpClient.js`) — real MCP client using
  `@modelcontextprotocol/sdk`'s `Client` + `StreamableHTTPClientTransport`,
  connecting to `process.env.SILPO_MCP_URL` (default `https://mcp.silpo.ua/mcp`).

Both implement the exact same async method surface (documented in
`src/silpo/SilpoClientInterface.js`), so `SilpoGateway` and everything above
it is unaware which one is active.

**This app owns its own OAuth 2.1 + PKCE client** for `mcp.silpo.ua` — see
`docs/b2b-mvp/SILPO_OAUTH.md` for the full architecture. It is independent
of Claude Code's own MCP session: `SilpoMcpClient` reads the current access
token from `src/silpo/oauth/tokenStore.js` on every call and injects it as
`Authorization: Bearer <token>` via a custom `fetch` passed to
`StreamableHTTPClientTransport`. If no token is stored, calls fail fast
with a typed `SilpoNotConnectedError` instead of a raw network error. If a
call comes back `401`, the client refreshes the token exactly once via
`SilpoOAuthClient.refresh()` and retries once; if that also fails, the
token is cleared and `SilpoNotConnectedError` is surfaced. Either way the
orchestrator catches the failure and marks the `ProcurementRun` `FAILED`
rather than crashing the process — that behavior is unchanged.

Getting a token in the first place still requires a **human** to complete
a real login at `auth.silpo.ua` in a browser — that's inherent to OAuth
(nobody, including this app, can complete someone else's login for them),
not a shortcut this build is taking. The flow: open the dashboard, click
"Connect Silpo" (`GET /api/silpo/connect`), log in, get redirected back.
See `SILPO_OAUTH.md` for the full sequence and `docs/b2b-mvp/DEMO_SCRIPT.md`
for the demo-time version of this step.

## Tool mapping

Only the tools actually needed for the demo flow are wired, named 1:1 to
`docs/silpo-mcp-audit/tool-inventory.json`:

| SilpoMcpClient method | Real MCP tool | Used by |
|---|---|---|
| `getMyShoppingCart` | `silpo_get_my_shopping_cart` | `SilpoGateway.getOrCreateCart` |
| `createShoppingCart` | `silpo_create_shopping_cart` | `SilpoGateway.getOrCreateCart` |
| `getShoppingCartById` | `silpo_get_shopping_cart_by_id` | `SilpoGateway.getCart`, `.prepareCart` (mandatory reread) |
| `getAvailableDeliveryTypes` | `silpo_get_available_delivery_types` | `SilpoGateway.resolveDeliveryContext` |
| `getTimeSlots` | `silpo_get_time_slots` | `SilpoGateway.resolveDeliveryContext` |
| `findAddress` | `silpo_find_address` | `SilpoGateway.resolveDeliveryContext` |
| `getCategoriesTree` | `silpo_get_categories_tree` | (available; category slugs are pre-known from the audit for the demo plan) |
| `getProducts` | `silpo_get_products` | `SilpoGateway.searchByCategory` (ProcurementAgent fallback) |
| `findProductsBatch` | `silpo_find_products_batch` | `SilpoGateway.searchProducts` (ProcurementAgent primary resolution) |
| `getPromotions` | `silpo_get_promotions` | `SilpoGateway.getPromotions` (BudgetPolicyAgent promo-swap) |
| `getReplacements` | `silpo_get_replacements` | `SilpoGateway.getReplacements` (wired, optional use) |
| `addOrUpdateCartProducts` | `silpo_add_or_update_cart_products` | `SilpoGateway.prepareCart` — **cart write** |
| `removeCartProducts` | `silpo_remove_cart_products` | available on the client; not exercised by the demo flow (nothing needs removing) |
| `updateShoppingCart` | `silpo_update_shopping_cart` | available on the client for delivery-type/slot changes; not required by the current demo flow |

Deliberately **not** wired: everything account/loyalty/family/certificates/
coupons/order-history related — all rated LOW or MEDIUM b2bUsefulness in the
audit and not needed for the forecast → proposal → approve → cart-prepare
flow.

## The safety gate, concretely

`cartPreparationService.prepareCartForProposal()` is the only function in
the codebase that calls `SilpoGateway.getOrCreateCart` / `.prepareCart`
(which in turn are the only `SilpoGateway` methods that reach a Silpo
write tool). Before doing anything else it checks, in code:

```js
if (proposal.status !== 'approved') throw ...
if (run && run.status !== RUN_STATES.APPROVED) throw ...
```

No UI state, convention, or comment enforces this — it's a hard runtime
check. See `test/orchestration.e2e.test.js` ("cart preparation is blocked
before approval").

## What is never called, anywhere

Checkout / payment / order-placement tools do not exist in the audited
Silpo MCP (`docs/silpo-mcp-audit/05-b2b-capability-matrix.md` row 25;
`07-gaps-and-limitations.md` section E). No code in this repo calls, wraps,
or fakes such a tool. `cartPreparationService`'s doc comment states this
explicitly as an invariant.

## Verifying live mode

Read-only sanity checks against the real MCP are safe and don't require a
token: `GET /.well-known/oauth-authorization-server`,
`GET /.well-known/oauth-protected-resource/mcp`, and `POST /register`
(Dynamic Client Registration) all succeed unauthenticated, as does
`GET /api/silpo/connect` producing a real `mcp.silpo.ua/authorize` redirect
with a freshly-registered `client_id` — see `docs/b2b-mvp/SILPO_OAUTH.md`.

Actually reaching a valid access token requires a human to complete a real
login at `auth.silpo.ua` (credentials/OTP) — that step cannot be automated
or verified from a plain script, by design. Everything up to and after that
point (DCR, authorize-URL construction, PKCE, callback handling, token
exchange/refresh/storage, gateway wiring, cart-write auth headers) is built
and tested (`test/silpoOAuth.test.js`, `test/silpoTokenStore.test.js`,
`test/silpoMcpClientAuth.test.js`).

For the hackathon demo, either (a) demo with `SILPO_MODE=mock` (default,
fully working, realistic fixture data derived from the real category
tree), or (b) demo `SILPO_MODE=live` end to end: click "Connect Silpo" on
the dashboard, log in with a real Silpo account when redirected, and the
rest of the pipeline runs against live data — see `SILPO_OAUTH.md`'s "demo
recovery" note for the fallback if live OAuth breaks mid-demo. Every real
Silpo product/category/price figure used to build the mock fixtures, and
the `B2B` delivery-type discovery referenced throughout these docs, was
itself validated live against the real MCP in
`docs/silpo-mcp-audit/00-live-validation-log.md`.
