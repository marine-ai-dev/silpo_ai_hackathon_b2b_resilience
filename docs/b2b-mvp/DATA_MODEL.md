# DATA_MODEL.md — Domain entities

All entities are plain JSON records persisted via `src/repositories/jsonStore.js`
(one array per collection inside `data/db.json`). None of this exists in the
Silpo MCP — see `docs/silpo-mcp-audit/05-b2b-capability-matrix.md` for which
rows are "MUST BE BUILT BY US" vs "NATIVE MCP".

| Entity | Collection | Purpose |
|---|---|---|
| `Company` | `companies` | Top-level tenant. One per demo (`Demo Tech Office`). |
| `Office` | `offices` | A physical office belonging to a Company: address, memberCount. |
| `OfficeMember` | `officeMembers` | Lightweight headcount/roster note; expected attendance itself is passed per-run, not stored per-member (kept intentionally small per spec). |
| `RecurringSupplyPlan` | `recurringSupplyPlans` | The template of what an office restocks weekly: a list of `SupplyItem`-shaped entries. |
| `SupplyItem` (embedded) | — | `{ productKey, label, category, unit, silpoCategorySlug, targetProductQuery }` — one row of a RecurringSupplyPlan. Not a separate top-level collection; embedded because it's always accessed through its plan. |
| `ConsumptionRecord` | `consumptionRecords` | One office/week/item quantity actually consumed — feeds DemandAgent's baseline. |
| `SupplyFeedback` | `supplyFeedback` | One office/week/item signal: `NOT_ENOUGH` \| `JUST_RIGHT` \| `TOO_MUCH`, optional note. |
| `OfficeBudget` | `officeBudgets` | `{ officeId, weeklyBudgetUAH }` — the hard ceiling BudgetPolicyAgent enforces. |
| `ProcurementPolicy` | `procurementPolicies` | `{ officeId, maxPerCategoryUAH, bannedCategorySlugs[], preferPromotions }`. |
| `DemandForecast` | `demandForecasts` | DemandAgent's output: per-item forecast quantity + rationale text. |
| `ProcurementProposal` | `procurementProposals` | ProcurementAgent + BudgetPolicyAgent's output: priced line items (`ProposalItem`), total, budget check, full audit `history[]`. Also carries `sourceMode` (`"live"` \| `"mock"`) — which `SilpoGateway`/client mode actually served the data for this proposal. |
| `ProposalItem` (embedded) | — | `{ productKey, label, category, silpoProductId, companyId, branchId, slug, unitPrice, quantity, lineTotal, onPromotion, previousQty, delta, reason, source, dataSource }`. `dataSource` (`"live"` \| `"mock"`) is set per item by `ProcurementAgent` from `silpoGateway.mode`, so the UI can tag every line individually — not just the proposal as a whole — as real Silpo data vs. fixture data. |
| `Approval` | `approvals` | One human decision on a proposal: `{ proposalId, approverName, decision, comment, decidedAt }`. A workflow transition, not agent output. |
| `ProcurementRun` | `procurementRuns` | The state-machine record for one office+week orchestration (see ARCHITECTURE.md). Links to its `DemandForecast`, `ProcurementProposal`, and `CartSyncRecord` by id. |
| `CartSyncRecord` | `cartSyncRecords` | Result of `cartPreparationService`: `{ proposalId, runId, silpoCartId, cartSnapshot, status, preparedAt, errorDetail, preExistingUnrelatedItemCount, note }`. `preExistingUnrelatedItemCount` / `note` record how many products already in the Silpo cart (not part of this proposal) were read and deliberately left untouched — cart writes are additive/quantity-setting per product, never a destructive replace. |
| `SilpoProductReference` | — (not persisted separately) | The shape returned by `SilpoGateway.searchProducts`/`searchByCategory`: `{ productId, slug, name, price, oldPrice, onPromotion, inStock, companyId, branchId }`. Cached only transiently inside a ProposalItem once chosen — no separate collection, to avoid a redundant catalog mirror. |
| `ReadinessItem` | `readinessItems` | Emergency-readiness catalog line for an office: `{ officeId, label, category, unit, silpoCategorySlug, targetProductQuery, targetQuantity }`. Seed set: batteries AA/AAA, LED lamp/lighting, candles, extension cord — the ONLY categories confirmed live in Silpo's catalog (see ROADMAP.md); deliberately excludes power banks/generators (confirmed NOT sold). |
| `ReadinessStockCheck` | `readinessStockChecks` | One manager-entered stock reading: `{ officeId, readinessItemId, checkedAt, currentQuantity, note }`. "How many do we actually have on hand right now" — manual, not sensor-driven. |
| `GeneratorBranch` | `generatorBranches` | A manually-refreshed snapshot row of a Silpo branch known to run on a generator: `{ city, address, sourceNote, silpoBranchId }`. `silpoBranchId` is nullable — best-effort text match against `silpo_list_branches`, left null rather than forced when not confident. Seeded from a real browser-captured snapshot of `silpo.ua/de-pracyuiemo-na-generatorax` (2026-09-03) — NOT a live feed; `sourceNote` on every row says so explicitly. |
| `RegionalBlackoutStatus` | `regionalBlackoutStatuses` | `{ officeId, active, setBy, setAt, note }` — a MANUAL toggle set by an office manager via the UI. There is no live blackout-schedule API integration in this version (none was found to exist for Ukrainian regional grid operators — see ROADMAP.md); this is the documented extension point for one, if ever confirmed. |
| `RecyclingLogEntry` | `recyclingLogEntries` | `{ officeId, quantity, loggedBy, loggedAt, note }` — a MANUAL log of batteries dropped off for recycling. Grounded in Silpo's real «Батарейки, здавайтеся!» (batareiky.ua) in-store collection program (247 stores, ≤50 batteries/visit) — no API exists for this, so it's a manager-entered count after each real drop-off, same pattern as `RegionalBlackoutStatus`. No Silpo MCP call involved. |

## Relationships

```
Company 1—* Office
Office 1—1 RecurringSupplyPlan
Office 1—1 OfficeBudget
Office 1—1 ProcurementPolicy
Office 1—* ConsumptionRecord
Office 1—* SupplyFeedback
Office 1—* ProcurementRun
ProcurementRun 1—1 DemandForecast
ProcurementRun 1—1 ProcurementProposal
ProcurementRun 1—1 CartSyncRecord (once CART_PREPARED)
ProcurementProposal 1—* Approval (in practice, exactly one accepted decision)
```

`ReadinessItem`/`ReadinessStockCheck` feed `src/agents/readinessAgent.js`'s
`computeShortfall`/`computeShortfalls` — a small, deliberately-named
stock-gap calculation (`shortfall = max(0, targetQuantity -
mostRecentKnownQuantity)`, treating "never checked" as 0 on hand), NOT a
DemandAgent-style consumption forecast. The resulting shortfalls are shaped
(`buildReadinessForecast`/`buildReadinessSupplyPlanItems`) to reuse the
existing `ProcurementAgent.buildProposal` / `BudgetPolicyAgent.applyPolicy`
pipeline unchanged — a readiness top-up produces the exact same
`ProcurementProposal`/`ProcurementRun` shapes as a weekly restock, tagged
`proposalKind: 'readiness-topup'` (vs `'weekly-restock'`) so the UI can
label which kind of run produced a given proposal.

`GeneratorBranch`/`RegionalBlackoutStatus` feed
`src/silpo/branchFailover.js`'s `applyBlackoutFailover` (a small pure,
defensive function), called from `SilpoGateway.resolveDeliveryContext()` as
a soft preference: if blackout is active for the office AND a
`GeneratorBranch` with a confirmed `silpoBranchId` exists for the office's
city, delivery routes through it; otherwise it falls back to the normal
geography-based branch selection unchanged. This never throws and never
blocks the pipeline.

## Resilience platform additions (see `docs/b2b-resilience/`)

`powerSchedules` — one collection, two `source` values (`'MANUAL'` |
`'DEMO'`) distinguishing rows written by `ManualScheduleProvider` (via the
UI's manual-entry form, `PUT /offices/:id/power-schedule`) from rows
written by `DemoScheduleProvider.seed()` (deterministic demo data). Shape:
`{ officeId, source, currentStatus, nextOutageStart, nextOutageEnd, note,
updatedAt }`. A `MANUAL` row for an office always takes priority over a
`DEMO` row for that office (see `src/power/index.js#getEffectivePowerSchedule`).
No new collection was needed for risk/plan output — `buildOfficeResiliencePlan()`
composes existing collections (`readinessItems`, `readinessStockChecks`,
`regionalBlackoutStatuses`, `recyclingLogEntries`) plus `powerSchedules`
into one response object; nothing about the composed plan itself is
persisted.

## Why `officeId` scoping everywhere

Multi-office/multi-tenant isn't a goal of this MVP (the seed creates exactly
one Office), but every collection is scoped by `officeId` from day one so
the same store could serve more than one office without a schema change —
matching how Silpo itself has no multi-office concept (audit finding #34)
and we don't want to inherit that limitation in our own layer.

## V2 addition: `powerSchedules`

| Entity | Collection | Purpose |
|---|---|---|
| `PowerSchedule` | `powerSchedules` | One row per `(officeId, source)` pair, `source ∈ {MANUAL, DEMO}`: `{ officeId, source, currentStatus, nextOutageStart, nextOutageEnd, note, updatedAt }`. `MANUAL` rows are written by an office manager via the Resilience tab's form (`ManualScheduleProvider.setSchedule`); `DEMO` rows are written only by `scripts/seed.js` (`DemoScheduleProvider.seed`). `getEffectivePowerSchedule(officeId)` (`src/power/index.js`) resolves which row is authoritative for an office: `MANUAL`, once present, always wins. No `LIVE`-sourced row exists in this version — see `docs/b2b-resilience/DTEK_RESEARCH.md`. |

Nothing else in the V1 schema above changed. The Resilience screen's
`buildOfficeResiliencePlan()` (`src/resilience/resiliencePlanner.js`) is a
read-mostly composition over this new collection plus the existing
`ReadinessItem`/`ReadinessStockCheck`/`RegionalBlackoutStatus`/
`GeneratorBranch`/`RecyclingLogEntry` collections above — it does not
persist a new "plan" record of its own; the plan is recomputed on every
`GET /offices/:id/resilience-plan` call.
