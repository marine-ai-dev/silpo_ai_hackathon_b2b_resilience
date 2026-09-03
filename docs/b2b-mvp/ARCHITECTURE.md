# ARCHITECTURE.md

## Layers

```
public/ (static dashboard, vanilla JS, no build step)
   │  fetch('/api/...')
   ▼
src/routes/api.js            Express JSON API — thin, no business logic
   ▼
src/services/
   procurementOrchestrator.js   owns the ProcurementRun state machine,
                                  sequences the 3 agents, persists their
                                  output. THE only place agents' outputs
                                  get written to the store.
   approvalService.js           workflow transition only (not an agent)
   cartPreparationService.js    the ONLY code path allowed to call Silpo
                                  cart-write tools; hard-gated on
                                  proposal.status === 'approved'
   ▼
src/agents/                  pure(ish) functions: given data + a gateway,
   demandAgent.js              return a forecast / proposal / policy result.
   procurementAgent.js          Never write to the store directly.
   budgetPolicyAgent.js
   ▼
src/silpo/SilpoGateway.js    the ONE seam to Silpo — domain-oriented methods
                               (resolveDeliveryContext, searchProducts,
                               getPromotions, getReplacements, getOrCreateCart,
                               prepareCart...), never raw MCP tool names
                               leaking into agents/services.
   ▼
src/silpo/SilpoMcpClient.js (live, @modelcontextprotocol/sdk over
                              Streamable HTTP) OR
src/silpo/MockSilpoMcpClient.js (fixtures) — selected by SILPO_MODE.
   │  (live mode only) reads/refreshes the bearer token
   ▼
src/silpo/oauth/                the app's own OAuth 2.1 + PKCE client,
   SilpoOAuthClient.js            independent of Claude Code's MCP session
   tokenStore.js                  (see docs/b2b-mvp/SILPO_OAUTH.md)
   ▼
src/repositories/jsonStore.js  flat-file JSON persistence (data/db.json)
```

`src/routes/silpoAuth.js` (mounted at `/api/silpo/*`, alongside
`src/routes/api.js`) is the HTTP surface for that OAuth module:
`GET /status`, `GET /connect`, `GET /oauth/callback`, `POST /disconnect`.
It talks only to `SilpoOAuthClient`/`tokenStore` — it never touches
`SilpoGateway` or the domain collections, keeping auth plumbing separate
from procurement business logic.

## The ProcurementRun state machine

Owned entirely by `procurementOrchestrator.runWeeklyProcurement()` and
`approvalService`/`cartPreparationService` for the later transitions:

```
DRAFT → FORECASTING → SOURCING → OPTIMIZING → READY_FOR_APPROVAL
                                                      │
                                          approve ────┼──── reject
                                                      ▼           ▼
                                                  APPROVED     CANCELLED
                                                      │
                                          prepare cart│
                                                      ▼
                                               CART_PREPARED

(any state) ──error──► FAILED
```

- `DRAFT → FORECASTING → SOURCING → OPTIMIZING → READY_FOR_APPROVAL` all
  happen inside one `runWeeklyProcurement()` call (see below).
- `READY_FOR_APPROVAL → APPROVED | CANCELLED` happens in
  `approvalService.decide()`, triggered by a human via `POST
  /api/proposals/:id/approval`. This is a plain state transition + audit
  record — explicitly NOT an agent or LLM call, per spec.
- `APPROVED → CART_PREPARED` happens in
  `cartPreparationService.prepareCartForProposal()`, triggered by a human
  via `POST /api/proposals/:id/prepare-cart`. This function re-checks
  `proposal.status === 'approved'` AND `run.status === APPROVED` in code
  before it will call any Silpo write method — not just relying on the UI
  only showing the button when appropriate.
- Any thrown error inside orchestration or cart prep moves the run to
  `FAILED` with `errorDetail` set, rather than leaving it in an ambiguous
  state.

## Orchestration, not agent-to-agent writes

`runWeeklyProcurement()` in `src/services/procurementOrchestrator.js` is the
single explicit function that:
1. Loads office context (office, plan, budget, policy, history, feedback).
2. Calls `demandAgent.forecast(...)` → persists the returned
   `DemandForecast` itself.
3. Calls `silpoGateway.resolveDeliveryContext(office)` then
   `procurementAgent.buildProposal(...)` → gets a draft proposal object
   back (not yet persisted).
4. Calls `budgetPolicyAgent.applyPolicy(...)` on that draft → gets the
   final, policy-compliant proposal object back.
5. Persists the final `ProcurementProposal` and transitions the run to
   `READY_FOR_APPROVAL`.

Agents themselves never import `jsonStore.js` or write records — they are
given data in, and return data out. This keeps the state machine legible
in one place and makes the agents independently unit-testable (see
`test/demandAgent.test.js`, `test/budgetPolicyAgent.test.js`).

## The Silpo seam

`SilpoGateway` is the only class that translates domain intent
("resolve a delivery context for this office", "search for these product
terms", "prepare a cart with these line items") into calls against the
underlying MCP client (`SilpoMcpClient` live / `MockSilpoMcpClient` mock).
No file outside `src/silpo/` calls a `silpo_*`-named method directly. This
means:
- Swapping `SILPO_MODE` never touches agent/service code.
- If the real Silpo MCP tool surface changes, only `SilpoGateway` (and the
  two client implementations) need updating.

## Emergency Readiness (Feature 1) — reuses the pipeline, not a 4th agent

`procurementOrchestrator.runReadinessTopUp({ officeId, silpoGateway })`
mirrors `runWeeklyProcurement` almost exactly: it creates a
`ProcurementRun`, computes readiness shortfalls (`src/agents/
readinessAgent.js`'s `computeShortfalls` — a stock-gap calculation, not a
forecast), shapes them into a `DemandForecast`-like object and a
`RecurringSupplyPlan`-like `.items` list, then calls the SAME
`ProcurementAgent.buildProposal` and `BudgetPolicyAgent.applyPolicy`
functions the weekly pipeline uses. No new agent was added, per
`docs/b2b-mvp/AGENTS.md`'s "do not add unnecessary agents" principle. The
only distinguishing marker on the resulting `ProcurementProposal` is
`proposalKind: 'readiness-topup'` vs `'weekly-restock'` — everything
downstream (Approval, `cartPreparationService`'s approved-status gate,
Cart Handoff) is unmodified and shared by both run kinds.

`POST /api/offices/:id/readiness-runs` triggers it; `GET /api/offices/:id/
readiness-items` returns each `ReadinessItem` with its computed shortfall
attached. The UI's "Emergency Readiness" tab reuses the existing Proposal/
Budget/Approval/Cart-Handoff screens unchanged — only the trigger and the
readiness-item/stock-check forms are new.

## Blackout-aware branch failover (Feature 2) — a soft preference in resolveDeliveryContext

`SilpoGateway.resolveDeliveryContext(office)` now finishes its existing
branch-resolution logic (mock: fixed mock branch; live: `silpo_get_available
_delivery_types` -> nearest/first B2B option) by calling a new private
`_applyBlackoutFailover(office, normalBranchId)`, which delegates to the
pure, unit-tested `src/silpo/branchFailover.js#applyBlackoutFailover`:

1. If the office has no `RegionalBlackoutStatus` with `active: true`, the
   normal branch is returned unchanged (`usedFailover: false`).
2. If active, the office's city is extracted from its free-text address
   (`extractCity`) and matched against `GeneratorBranch.city`.
3. A match with a confirmed `silpoBranchId` reroutes delivery to that
   branch (`usedFailover: true`); a match with no confirmed `silpoBranchId`,
   or no match at all, or an unresolvable city, all fall back to the normal
   branch — never a forced/fuzzy guess.
4. The whole check is wrapped in `try/catch` in `SilpoGateway` itself, so a
   bug or missing data here can never break delivery-context resolution or
   the wider procurement pipeline.

The resulting `{ branchId, usedFailover, reason, generatorBranch? }` is
returned as `deliveryContext.branchSelection` and surfaced read-only via
`GET /api/offices/:id/delivery-branch-preview`, which the Office Setup tab's
"Current delivery branch" panel renders alongside a manual
`RegionalBlackoutStatus` toggle (`PUT /api/offices/:id/blackout-status`).
There is no live blackout-schedule API and no live scrape of
`silpo.ua/de-pracyuiemo-na-generatorax` (Cloudflare-protected, confirmed) —
`GeneratorBranch` is a manually-refreshed snapshot seeded from a real
browser-captured read of that page, and `RegionalBlackoutStatus.active` is
set entirely by a human via the UI. Both facts are stated in the UI copy
itself so nobody mistakes this for live monitoring.

## Resilience platform layer (see `docs/b2b-resilience/ARCHITECTURE.md`)

`src/power/` (`PowerScheduleProvider` interface, `ManualScheduleProvider`,
`DemoScheduleProvider`), `src/resilience/riskModel.js` (pure deterministic
risk classification + timing math, Europe/Kyiv-aware) and
`src/resilience/resiliencePlanner.js` (composes power + readiness +
branch-failover + ESG into one read-mostly plan) sit alongside, not inside,
the existing agent/service layers — `resiliencePlanner` calls into
`readinessAgent`, `SilpoGateway.resolveDeliveryContext`, and the existing
collections, but never calls `runWeeklyProcurement`/`runReadinessTopUp`
itself, so viewing a plan can never mutate a Silpo cart. Routes:
`GET /offices/:id/resilience-plan`, `GET`/`PUT /offices/:id/power-schedule`.

## Cross-reference to the audit

- `docs/silpo-mcp-audit/05-b2b-capability-matrix.md` — for every capability
  in this product, which classification (NATIVE MCP / MUST BE BUILT BY US /
  NOT CURRENTLY POSSIBLE) it falls under, and therefore which layer above
  owns it.
- `docs/silpo-mcp-audit/07-gaps-and-limitations.md` section E — the
  explicit list of things that are impossible with the current MCP
  (order placement chief among them), which is why `cartPreparationService`
  stops at a prepared cart and nothing further exists in this codebase.

## V2: Resilience Platform (see `docs/b2b-resilience/ARCHITECTURE.md` for full detail)

Adds `src/power/` (a `PowerScheduleProvider` interface plus
`ManualScheduleProvider`/`DemoScheduleProvider`) and `src/resilience/`
(`riskModel.js` — pure/deterministic risk classification, no LLM call —
and `resiliencePlanner.js`, which composes power status + readiness
shortfall (reusing `readinessAgent` unchanged) + risk + delivery-branch
context (reusing `SilpoGateway.resolveDeliveryContext`/`branchFailover.js`
unchanged) + ESG stats into one read-mostly plan). New routes: `GET
/offices/:id/resilience-plan`, `GET`/`PUT /offices/:id/power-schedule`.
Viewing a plan never calls `ProcurementAgent`/`BudgetPolicyAgent` or
touches a Silpo cart — turning a recommendation into a real proposal still
goes through the unmodified `runReadinessTopUp()` → approval →
`cartPreparationService` pipeline above. No 4th agent was added.
