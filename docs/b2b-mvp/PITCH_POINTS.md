# PITCH_POINTS.md

## Problem

Office managers run a recurring, manual, budget-constrained grocery
purchase every week (water, coffee, snacks, paper goods) with no tooling:
they guess quantities, browse the Silpo app by hand, and track spend
mentally. Over- and under-stocking is common and invisible until someone
complains.

## User

Office managers / admins at small-to-mid companies (seeded demo: ~24-28
person office) who already buy groceries through Silpo but do it entirely
manually.

## Value proposition

Turn a 30-60 minute weekly manual task into a reviewable, one-click-approve
workflow: an explainable AI-generated basket, budget-checked automatically,
approved by a human, and handed off as a real, ready-to-checkout Silpo
cart.

## Why agents, not a chatbot

A chatbot answers questions. This system makes decisions and shows its
work: DemandAgent computes actual quantities from real history + feedback
+ attendance; ProcurementAgent resolves those to real, priced, in-stock
SKUs; BudgetPolicyAgent enforces a real budget ceiling with visible
trims/swaps. None of that is "ask the model and hope" — it's inspectable
math and rules, logged step by step (see any proposal's `history[]`).

## Why Silpo MCP

Silpo's MCP exposes a genuinely capable commerce backend — full catalog,
live pricing/stock/promotions, and a real cart lifecycle including a
dedicated `B2B` delivery type — reachable read/write through 40 documented
tools (`docs/silpo-mcp-audit/`). That's a real foundation, not a toy API,
which is why this is a believable MVP and not a demo built on fabricated
data.

## Why B2B

Consumer grocery apps solve "what do I want to eat this week." Offices
have a different problem: recurring bulk restocking under a budget, with
sign-off. Silpo's MCP has zero B2B-specific objects beyond a delivery-type
label (`docs/silpo-mcp-audit/07-gaps-and-limitations.md`) — the entire
budget/policy/approval/forecast layer is greenfield, and that's exactly
what this product builds.

## Differentiation

Not a basket-sharing feature, not a chatbot skin on Silpo's app. Real
forecasting math with cold-start handling, real constrained budget
optimization with promotion-aware substitution, and a real (if
consumer-shaped) cart at the end — with an explicit, code-enforced stop
before anything financial happens.

## Measurable value (from the seeded scenario)

- Forecast reacts to real signal: water usage was under-forecast twice
  (`NOT_ENOUGH` feedback) — the system corrects it automatically instead of
  waiting for a third complaint.
- Snacks over-ordering (`TOO_MUCH` feedback) is corrected downward
  automatically, freeing budget for the water increase and higher expected
  attendance without any manual reallocation.
- BudgetPolicyAgent's audit trail makes every UAH adjustment explainable to
  a manager approving the basket in under a minute, instead of them
  re-deriving quantities from scratch.

## The checkout limitation — and why we made it a feature

No Silpo MCP tool places, confirms, or pays for an order — this is
independently confirmed across all 40 tool schemas in the audit
(`05-b2b-capability-matrix.md` row 25, `07-gaps-and-limitations.md`
section E). Rather than fake a checkout button, we designed the product
around the real boundary: the system prepares a fully priced, validated
Silpo cart and stops. A human finishes checkout in the Silpo app — the
correct place for a financial action to require a human anyway, especially
for a company spending real money.

## Future expansion

- Real B2B company accounts if/when Silpo exposes them (the `B2B` delivery
  type suggests backend support already exists).
- Per-employee preferences feeding into the basket (Silpo's
  `silpo_get_my_food_restrictions` pattern hints at the shape, but it's
  single-account today).
- Multi-office support (already schema-ready via `officeId` scoping
  throughout `DATA_MODEL.md`).
- Slack/email notifications when a proposal is ready for approval.
- Swap the JSON file store for a real SQL database behind the same
  `Collection` interface — no other code would need to change.
