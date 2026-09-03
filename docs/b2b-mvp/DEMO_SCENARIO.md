# DEMO_SCENARIO.md

## Seed data (`scripts/seed.js`)

- **Company**: Demo Tech Office
- **Office**: Kyiv HQ, вул. Хрещатик 1, Київ, baseline `memberCount = 24`
- **RecurringSupplyPlan**: water, coffee, tea, milk, fruit, snacks
- **OfficeBudget**: 3500 UAH/week
- **ProcurementPolicy**: caps on coffee (1400 UAH) and snacks (700 UAH), no
  banned categories, `preferPromotions: true`
- **5 weeks of ConsumptionRecord history** per item, with visible
  week-over-week variation (not flat lines)
- **SupplyFeedback**, deliberately covering all three signals so the demo
  visibly reacts to real signal, not hardcoded output:
  - **water** — `NOT_ENOUGH` logged twice (two weeks running) → DemandAgent
    should recommend a clear increase.
  - **milk** — `JUST_RIGHT` → no adjustment.
  - **snacks** — `TOO_MUCH` → DemandAgent should recommend a decrease.
- **Next week's expected attendance (28)** is set above the historical
  baseline member count (24), so attendance scaling visibly moves every
  quantity up, compounding with the water increase and partially offsetting
  the snacks decrease.

## What the demo should show happening (and does, verified in
`test/orchestration.e2e.test.js`)

- Water: forecast delta is **positive** (baseline lifted by both attendance
  scaling and the NOT_ENOUGH feedback bump).
- Snacks: forecast delta is **negative** (TOO_MUCH feedback pulls it down
  despite attendance scaling pulling it up).
- Milk: forecast tracks attendance scaling only, no feedback-driven jump.
- The resulting ProcurementProposal resolves every item to a real (fixture)
  Silpo product with a real price, and BudgetPolicyAgent trims/swaps as
  needed to land at-or-under the 3500 UAH weekly budget — visible in the
  Budget Optimization screen's notes and audit trail.

## Live-mode note

Seed data intentionally does not depend on any live Silpo response — it's
pure domain data. Running with `SILPO_MODE=live` swaps only the catalog
resolution step (ProcurementAgent's product search) to hit the real MCP;
the forecast math and budget logic are unaffected either way.
