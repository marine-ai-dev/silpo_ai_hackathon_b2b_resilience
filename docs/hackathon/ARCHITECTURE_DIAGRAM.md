# ARCHITECTURE_DIAGRAM.md — presentation diagram spec

A single-flow diagram for the pitch deck (Slide 8) and for judges who ask
"show me the architecture." Source of truth for the actual code paths:
`docs/b2b-resilience/ARCHITECTURE.md` and `docs/b2b-mvp/ARCHITECTURE.md` —
this file is the presentation-ready version of the same real flow, not a
separate design.

## Color/shape legend (use consistently on the slide)

| Category | Suggested color | What belongs here |
|---|---|---|
| 🟣 **AI / agentic reasoning** | violet | DemandAgent, ProcurementAgent, BudgetPolicyAgent — the only three LLM-free-but-"agent"-labeled decision components in this system |
| 🔵 **Deterministic rules** | blue | riskModel.js, resiliencePlanner.js's composition logic, readinessAgent.js's stock-gap math, branchFailover.js's confidence-gated matching — plain arithmetic/comparisons, explainable, no LLM call |
| 🟢 **Live Silpo MCP data** | green | Real `silpo_find_products_batch`, `silpo_get_available_delivery_types`, `silpo_get_time_slots`, `silpo_add_or_update_cart_products` calls — only ever green when the actual call happened, never as a default assumption |
| 🟠 **Manual / demo / seeded data** | amber | ManualScheduleProvider entries, RegionalBlackoutStatus toggle, ReadinessStockCheck entries, RecyclingLogEntry, the generator-branch snapshot, DemoScheduleProvider seed data |
| ⚪ **Human decision point** | gray/white, distinct icon (e.g. a person silhouette) | Manager approval, manual power-schedule entry, manual blackout toggle, manual recycling log entry |

## The flow (draw top to bottom or left to right)

```
🟠 Power Schedule (Manual entry OR Demo-seeded)     🟠 Office Inventory (ReadinessStockCheck, manual)
              \                                              /
               \                                            /
                v                                          v
                 🔵 RESILIENCE PLANNER (resiliencePlanner.js)
                 — composes power status + stock shortfall + risk + logistics + ESG
                 — read-mostly: viewing this NEVER writes to a Silpo cart
                        |
        +---------------+----------------------------------+
        |                                                   |
        v                                                   v
  🔵 Risk Model (riskModel.js)                    🟣 Demand Agent  →  🟣 Procurement Agent
  NORMAL→WATCH→PREPARE→HIGH→                              |                    |
  ACTIVE_BLACKOUT, + timing math                            v                    v
        |                                              (weekly restock)   🟢 SILPO MCP GATEWAY
        v                                                                  silpo_find_products_batch
   Recommendation (plain-language,                                        silpo_get_available_delivery_types
   built from the SAME reasons                                            silpo_get_time_slots
   above — no separate LLM call)                                                |
        |                                                                       v
        |                                                              🟣 Budget & Policy Agent
        |                                                              — promo swaps, category caps,
        |                                                              proportional trim to fit budget
        |                                                                       |
        |                                                                       v
        |                                                          ProcurementProposal (pending_approval)
        |                                                                       |
        +-----------------------------+-----------------------------------------+
                                       v
                          ⚪ MANAGER APPROVAL (human decision point)
                          — the ONLY thing that can flip status to 'approved'
                                       |
                                       v
                    🟢 cartPreparationService → silpo_add_or_update_cart_products
                    — the ONLY code path allowed to write a real Silpo cart
                    — hard-gated in code on status === 'approved'
                    — checkout/payment stays a separate, human, out-of-app step
                    — no such tool exists in the audited Silpo MCP anyway

  🔵 Power state + 🟠 resilient-branch dataset (generator-branch snapshot,
     confidence-matched: EXACT / HIGH_CONFIDENCE / AMBIGUOUS / UNMATCHED)
        |
        v
  🔵 branchFailover.js — logistics recommendation
     (only ever reroutes on a CONFIRMED match; AMBIGUOUS/UNMATCHED
      always fall back to the normal nearest-branch selection)


  ⚪ Battery use (implicit — office consumes readiness stock)
        |
        v
  ⚪ Manual recycling log entry (RecyclingLogEntry)
        |
        v
  🔵 ESG metrics (total recycled, drop-off count — real counts only,
     no derived "collection rate" since consumption isn't tracked,
     no CO2/environmental-impact figures anywhere)
```

## One-paragraph caption for the slide

> Power status and office inventory feed a deterministic Resilience
> Planner, which classifies risk and hands off to the same three agents
> (Demand, Procurement, Budget & Policy) that already run the weekly Silpo
> restock — resolving real products through the live Silpo MCP gateway.
> Every recommendation stops at a human manager before anything touches a
> real Silpo cart. Branch resilience uses only confidence-confirmed
> generator-branch matches; ambiguous matches never trigger a reroute.
> Battery use closes through a manual recycling log into honest,
> non-fabricated ESG metrics.

## What NOT to draw (common overclaim traps)

- Do not draw a line from "Power Schedule" to any box labeled "DTEK" or
  "Live API" — no such live connection exists (see
  `docs/b2b-resilience/DTEK_RESEARCH.md`).
- Do not draw "Manager Approval" as optional or bypassable — every arrow
  into the Silpo-cart-write box must visibly pass through it.
- Do not draw a 4th/5th agent box for the Resilience Planner or Risk
  Model — they are explicitly deterministic services (blue), not agents
  (violet), per `docs/b2b-mvp/AGENTS.md`.
- Do not draw an arrow from ESG metrics to any "environmental impact" or
  "CO2 saved" box — it doesn't exist and shouldn't be implied.
