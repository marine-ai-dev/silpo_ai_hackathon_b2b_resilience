# IMPLEMENTATION_PLAN.md

Recorded after the fact as a build log / map of what exists where.

## File layout

```
src/
  agents/
    demandAgent.js            DemandAgent
    procurementAgent.js       ProcurementAgent
    budgetPolicyAgent.js      BudgetPolicyAgent
  services/
    procurementOrchestrator.js  runWeeklyProcurement() + RUN_STATES
    approvalService.js          decide()
    cartPreparationService.js   prepareCartForProposal() — the sole cart-write path
  silpo/
    SilpoClientInterface.js   documents the shared client method surface
    SilpoMcpClient.js         live MCP client (@modelcontextprotocol/sdk)
    MockSilpoMcpClient.js     fixture-backed mock client
    SilpoGateway.js           domain-oriented seam used by agents/services
    fixtures.js               mock catalog/categories/promotions/delivery data
  repositories/
    jsonStore.js              flat-file JSON persistence, one Collection per entity
  routes/
    api.js                    Express JSON API
  server.js                   app bootstrap (seed-if-empty, mount API + static)
scripts/
  seed.js                     seed() + seedIfEmpty() + demo constants
public/
  index.html, app.js, styles.css   static dashboard, no build step
test/
  demandAgent.test.js
  budgetPolicyAgent.test.js
  mockSilpoClient.test.js
  orchestration.e2e.test.js
docs/b2b-mvp/                 this document set
docs/silpo-mcp-audit/         pre-existing audit (ground truth on Silpo MCP)
data/db.json                  generated at first run by seedIfEmpty()
```

## Build order followed

1. Re-read the audit (tool inventory, B2B capability matrix, gaps) to fix
   exact tool names/params before writing any Silpo code.
2. `jsonStore.js` — persistence first, since everything else depends on it.
3. `MockSilpoMcpClient` + `fixtures.js` — so agents/services could be built
   and tested without ever needing live auth.
4. `SilpoGateway` — the seam, written against the mock client's shape.
5. `SilpoMcpClient` (live) — written to the same interface, using
   `@modelcontextprotocol/sdk`'s `Client` + `StreamableHTTPClientTransport`.
6. Three agents, each pure-function-shaped and independently testable.
7. `procurementOrchestrator`, `approvalService`, `cartPreparationService` —
   the state machine and its two human-gated transitions.
8. Express API + static dashboard.
9. Seed script with the deliberately-varied demo data described in
   `DEMO_SCENARIO.md`.
10. Tests (`node:test`), then manual end-to-end verification via curl
    against a running server (see `DEMO_SCRIPT.md`).

## Deviations from the original brief (and why)

- Docs live under `docs/b2b-mvp/` per the addendum, not `docs/mvp/`.
- Domain model renamed to match the addendum (`RecurringSupplyPlan`,
  `SupplyFeedback` with `NOT_ENOUGH`/`JUST_RIGHT`/`TOO_MUCH`,
  `OfficeBudget` + `ProcurementPolicy` split out, `ProcurementRun` as an
  explicit state machine separate from `ProcurementProposal`,
  `CartSyncRecord`, `Approval`).
- 10 UI "screens" are implemented as tab-switched sections in one static
  page rather than 10 separate page loads — faster to build well and matches
  the addendum's own suggestion ("organize as clear sections/tabs... if
  that's faster to build well").
- `SilpoProductReference` is not a separately persisted collection — it's
  the transient shape `SilpoGateway` returns from search calls, folded into
  a `ProposalItem` once chosen. Persisting a redundant catalog mirror added
  no demo value.
- `silpo_get_replacements` is wired on the gateway but not auto-invoked by
  ProcurementAgent (kept as the spec's documented optional nice-to-have);
  BudgetPolicyAgent's promotion-swap step covers the demoed substitution
  behavior instead.
