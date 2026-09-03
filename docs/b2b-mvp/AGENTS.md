# AGENTS.md — the three agents

All three are deterministic, well-commented algorithms — not LLM calls.
The "AI" in the product name is the forecasting/optimization logic itself,
not a chat model. Full implementations: `src/agents/*.js`.

## 1. DemandAgent (`src/agents/demandAgent.js`)

`forecast(office, supplyPlan, consumptionHistory, feedbackHistory, expectedAttendance, weekOf)`

1. **Baseline**: trailing average weekly quantity per `productKey` over
   available `ConsumptionRecord` history. Cold start (no history yet) uses
   a sane per-category default (`COLD_START_DEFAULTS`).
2. **Attendance scaling**: multiply by `expectedAttendance / office.memberCount`.
3. **Feedback adjustment**: the most recent `SupplyFeedback` per item —
   `NOT_ENOUGH` → +20%, `TOO_MUCH` → -20% (floored at an essential minimum
   for categories like water), `JUST_RIGHT` → no change.
4. Every step appends a plain-English sentence to `rationale`, so the
   Proposal screen can show "Water 40L → 56L ↑+16L — baseline 40.2L,
   scaled by attendance 28/24, +20% for NOT_ENOUGH feedback" in the UI.

Returns a `DemandForecast` (not yet persisted — the orchestrator persists it).

## 2. ProcurementAgent (`src/agents/procurementAgent.js`)

`buildProposal(office, forecast, silpoGateway, deliveryContext, supplyPlan)`

1. Builds one batched `silpoGateway.searchProducts(terms, deliveryContext)`
   call for the whole forecast (→ `silpo_find_products_batch`, up to 30
   terms/call per the audit).
2. Per item, picks the best candidate: prefer in-stock, then cheapest.
3. Falls back to `silpoGateway.searchByCategory(...)` (→ `silpo_get_products`)
   if the batch search returned nothing usable for that term.
4. Produces a draft `ProcurementProposal` (`status: 'draft'`) with real
   resolved `silpoProductId`/`unitPrice`/`lineTotal` per item, and logs an
   entry to `history[]` noting any items it could not resolve.

`silpoGateway.getReplacements` is wired and available for substitution but
kept as the documented nice-to-have — the agent does not currently call it
automatically to avoid over-engineering the demo path; BudgetPolicyAgent
uses the equivalent `getPromotions` pattern for its own substitution step.

## 3. BudgetPolicyAgent (`src/agents/budgetPolicyAgent.js`)

`applyPolicy(proposal, officeBudget, procurementPolicy, silpoGateway, deliveryContext)`

1. **Banned categories**: strip any item whose category is in
   `bannedCategorySlugs`.
2. **Per-category cap**: for each `maxPerCategoryUAH` entry, trim quantities
   (never below 1, or below an essential floor like water's 12) until the
   category subtotal fits.
3. **Overall weekly budget**: if still over `weeklyBudgetUAH`:
   a. If `preferPromotions`, try swapping non-promoted items for a cheaper
      promoted SKU via `silpoGateway.getPromotions`.
   b. Otherwise (or if still over), proportionally trim the largest line
      items first, down to essential floors, until within budget or no
      further trim is possible.
4. Every adjustment is logged to both `proposal.history[]` (full audit
   trail, actor = `BudgetPolicyAgent`) and `proposal.budgetCheck.notes[]`
   (human-readable summary shown on the Budget Optimization screen).
5. Sets `status: 'pending_approval'` — ready for a human, unconditionally,
   even if a hard-floor item still leaves the proposal over budget (in
   which case `budgetCheck.withinBudget = false` and a note flags it for
   manual review — the agent never silently under-delivers essentials to
   force a fit).

## Why these three and not more

The spec is deliberately scoped to exactly these three agents plus the
approval workflow. No LLM/chat agent, no notification agent, no
multi-office orchestration agent — see `docs/b2b-mvp/PRODUCT.md` "explicitly
out of scope".
