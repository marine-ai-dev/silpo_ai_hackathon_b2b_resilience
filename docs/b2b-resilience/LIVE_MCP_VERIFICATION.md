# LIVE_MCP_VERIFICATION.md — resilience feature exercised against the real Silpo MCP

This document records a genuine, observed run of the resilience pipeline
against `https://mcp.silpo.ua/mcp` in `SILPO_MODE=live`, performed during
the final hardening pass. No values below are invented or backfilled from
mock fixtures — every field quoted here came from an actual HTTP response
captured during this session.

## Run metadata

- **Date/time:** 2026-09-03, ~13:30 UTC (Europe/Kyiv ~16:30)
- **Execution mode:** `SILPO_MODE=live`, app process started locally (`npm start`), authenticated via the app's own OAuth 2.1 + PKCE client (`src/silpo/oauth/`), independent of Claude Code's own MCP session — see `docs/b2b-mvp/SILPO_OAUTH.md` for how that connection was originally established.
- **MCP endpoint:** `https://mcp.silpo.ua/mcp`
- **Authentication result:** `GET /api/silpo/status` → `{"connected":true,"expiresAt":1791018241429,"connectedAt":"2026-09-03T09:04:01.429Z"}` — the previously-established app token was still valid; no fresh browser login was requested or performed (per this task's instruction not to ask for browser authentication).

## Operation 1 — Emergency Readiness → Procurement → real Silpo product search

**Trigger:** `POST /api/offices/office-kyiv-hq/readiness-runs` (the same endpoint the Resilience screen's "resolve shortfall" action calls).

**What happened, in order:**
1. `readinessAgent` computed a stock-gap shortfall for 5 seeded emergency items (batteries AA/AAA, LED lighting, candles, extension cord) — pure local calculation, no MCP call.
2. `ProcurementAgent.buildProposal()` called `SilpoGateway.searchProducts()` → real `silpo_find_products_batch` tool call against `mcp.silpo.ua`.
3. `BudgetPolicyAgent.applyPolicy()` optimized the resolved items against the office's ₴3500 weekly budget — pure local calculation, no MCP call.

**Result (`run.status`): `READY_FOR_APPROVAL`.** `proposal.sourceMode: "live"`, every resolved line item tagged `dataSource: "live"`.

**Real products returned by the live Silpo catalog** (prices as returned, not mock fixture values):

| Item | Qty | Unit price | Data source |
|---|---|---|---|
| Батарейки AA | 12 | ₴119 | live |
| Батарейки AAA | 8 | ₴199 | live |
| LED-ліхтарик / лампа | 3 | ₴58.99 | live |
| Свічки | 4 | ₴71.99 | live |

**Graceful degradation observed live (not simulated):** the 5th item, "Подовжувач" (extension cord), did NOT resolve on this live run — `history[]` records: *"Resolved 4/5 forecasted items to Silpo products. Could not resolve a Silpo product for \"Подовжувач\" (search term \"подовжувач\"). Excluded from proposal."* This is the real catalog returning no usable match at this moment (stock/assortment varies over time) — the system logged it honestly and excluded the line rather than fabricating a product or crashing. This is itself evidence the live path is real: mock mode always resolves this item deterministically from a fixed fixture; live mode just showed the actual variability of a real catalog.

**Budget optimization, live prices:** `BudgetPolicyAgent` proportionally trimmed quantities to close a ₴460.93 gap against the ₴3500 weekly budget, landing on a ₴3484.93 total — computed from the real prices above, not mock numbers.

## Operation 2 — Resilience plan logistics → real branch/delivery-context resolution

**Trigger:** `GET /api/offices/office-kyiv-hq/resilience-plan`.

**What happened:** `resiliencePlanner.js` called `SilpoGateway.resolveDeliveryContext()`, which called the real `silpo_get_available_delivery_types` / `silpo_get_time_slots` tools.

**Result (`logistics` section of the plan):**
```json
{
  "branchId": "1ee11bac-502d-6cd6-bd9d-7921cac13a23",
  "deliveryType": "B2B",
  "timeslotStart": "2026-09-03T13:30:00+00:00",
  "timeslotEnd": "2026-09-03T15:00:00+00:00",
  "branchSelection": {
    "branchId": "1ee11bac-502d-6cd6-bd9d-7921cac13a23",
    "usedFailover": false,
    "reason": "Blackout not marked active for this office — using the normal nearest-branch selection."
  },
  "available": true
}
```
`branchId 1ee11bac-502d-6cd6-bd9d-7921cac13a23` is the real Kyiv B2B-capable branch first discovered during the original Silpo MCP audit (`docs/silpo-mcp-audit/00-live-validation-log.md`) — the same identifier, confirming this is a genuine catalog/delivery-context lookup, not a fixture echo.

## What was deliberately NOT executed

- **No checkout, payment, order placement, or cancellation** — no such tool exists in the audited Silpo MCP (`docs/silpo-mcp-audit/05-b2b-capability-matrix.md`), and none was called or simulated.
- **No cart write was performed in this verification pass.** The proposal reached `READY_FOR_APPROVAL` only; approving it and calling `prepare-cart` would additionally exercise `silpo_add_or_update_cart_products`/`silpo_get_shopping_cart_by_id` against the real account — that path was already verified live in an earlier session (see `docs/b2b-mvp/DEMO_SCRIPT.md`) and was not re-run here to avoid unnecessary repeated writes to a real personal Silpo cart during an unattended hardening pass.
- **No fresh OAuth login was requested or performed.** The existing app-level token was still valid and used as-is.

## Data provenance takeaway

This confirms the "ideal flow" end-to-end through the actual running app, not a simulation of it: **Emergency stock gap → ProcurementAgent → live Silpo MCP product search → real Silpo products with real prices → BudgetPolicyAgent optimization → READY_FOR_APPROVAL recommendation**, plus a genuine live branch/delivery-context resolution for the logistics card. Server was returned to `SILPO_MODE=mock` after this verification (the default for safe local development), per the seed/reset procedure documented in `docs/b2b-mvp/README.md`.
