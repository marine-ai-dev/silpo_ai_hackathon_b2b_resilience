# HACKATHON_NARRATIVE.md

## Positioning (one sentence)

> An AI procurement layer using Silpo MCP helps Ukrainian businesses
> prepare essential office stock before known power interruptions, adjust
> delivery timing, recommend more resilient Silpo locations where
> defensibly supported, and close the battery lifecycle through recycling.

This is **not** "AI buys office snacks." Every part of that sentence maps
to something actually built and verified in this repository — not to an
aspiration:

| Clause | Backed by |
|---|---|
| "prepare essential office stock before known power interruptions" | Emergency Readiness stock-gap tracking + risk-classified procurement timing (`src/resilience/riskModel.js`, `resiliencePlanner.js`) |
| "adjust delivery timing" | `recommendTiming()` — deadline/window arithmetic on the outage window |
| "recommend more resilient Silpo locations where defensibly supported" | `src/silpo/generatorBranchMatcher.js` — confidence-classified branch matching (EXACT/HIGH_CONFIDENCE only ever act; AMBIGUOUS/UNMATCHED never do) |
| "close the battery lifecycle through recycling" | `recyclingLogEntries` + the real, verified «Батарейки, здавайтеся!» program |
| "using Silpo MCP" | Real `silpo_find_products_batch`/`silpo_get_available_delivery_types`/`silpo_get_time_slots` calls in the procurement and logistics paths — see `LIVE_MCP_VERIFICATION.md` for an actual observed live run |

## Problem

Ukrainian offices now plan around routine, sometimes unscheduled, power
outages caused by attacks on energy infrastructure. An office-procurement
assistant that only thinks about coffee and water misses something that's
become a normal operational reality: knowing *when* an outage is coming,
whether the office has enough batteries/light/candles on hand, and whether
the delivery that's supposed to arrive can even reach a working branch.

This project already built (V1) a working AI office-procurement pipeline
against the real Silpo MCP, plus two building blocks aimed exactly at this
problem: an Emergency Readiness stock-gap tracker, and blackout-aware
branch failover. What was missing was the layer that ties them together
into one coherent, explainable "here's the situation, here's what to do,
here's why" view — instead of three separate tabs a manager has to mentally
combine themselves.

## Solution

A new **Resilience** screen that composes, for one office: current power
status (manually entered or demo-seeded, never faked as live), emergency
readiness shortfall (reused from V1), a deterministic risk classification
(NORMAL → WATCH → PREPARE → HIGH → ACTIVE_BLACKOUT, with plain-English
reasoning, not a black box), a delivery-timing recommendation (simple
arithmetic on the outage window), which Silpo branch delivery would route
through and why (including generator-branch failover during a blackout),
and real ESG battery-recycling stats. Viewing the plan never mutates
anything — turning a recommendation into an actual order still goes
through the exact same approval-gated pipeline V1 already built.

## Why the Silpo MCP matters here

The Silpo MCP is what turns "we should buy more batteries" into a real,
priced, branch-specific, in-stock product line — `silpo_find_products_batch`
resolves the readiness shortfall items to actual SKUs, and
`silpo_get_available_delivery_types`/`silpo_get_time_slots` (via
`SilpoGateway.resolveDeliveryContext`) determine which branch and delivery
window are actually viable. Without it, this would be a spreadsheet with
opinions. With it, the "Branch Resilience" card can honestly say "here's
the real branch we'd order from, and here's why a generator-backed
alternative would be safer during a blackout" — grounded in the same audit
discipline (`docs/silpo-mcp-audit/`) this whole project has followed from
the start: no invented tools, no guessed response shapes, no claiming a
capability (like checkout) that doesn't exist in the MCP.

## How the agents cooperate

No new LLM agent was added. The three existing deterministic agents
(`DemandAgent`, `ProcurementAgent`, `BudgetPolicyAgent`) and the
explicitly-not-an-agent `readinessAgent` are reused exactly as they were —
the new `riskModel`/`resiliencePlanner` pieces are the same kind of thing
`readinessAgent` already was: plain, testable, explainable arithmetic, not
a 4th "AI." The resilience plan's `procurement` section deliberately never
calls `ProcurementAgent` itself — it only describes what *would* happen,
so viewing a risk assessment can never accidentally trigger a real
Silpo interaction. Acting on it still requires a human to click through to
the existing, unchanged readiness-topup → approval → cart-handoff flow.

## Societal benefit

Small and mid-size Ukrainian offices don't have dedicated ops teams
tracking DTEK schedules against battery inventory against which branch is
still fulfillable. This tool doesn't replace checking DTEK's own outage
information — it can't, honestly, since no live official API exists (see
`DTEK_RESEARCH.md`) — but it gives a manager who *has* that information
(from DTEK's site, bot, or a company group chat) one place to log it once
and immediately see the downstream consequences: is our stock enough, is
our delivery branch safe, when should we order. That's a real reduction in
cognitive load during an already stressful situation, built on real data
the manager already has, not a promise of automation that doesn't exist.

## ESG benefit

The battery-recycling integration is small but real: it's tied to Silpo's
actual «Батарейки, здавайтеся!» in-store collection program (247 stores,
verified via web research in V1), and the Resilience screen's ESG card
makes the office's own recycling habit visible alongside its emergency
battery consumption — a natural nudge to close the loop (buy batteries for
readiness → use them → recycle them at the same stores) without
fabricating any environmental-impact numbers to make it look more
impressive than it is.

## Demo walkthrough (see `DEMO_SCENARIOS.md` for exact steps)

1. **Scenario A** — Kyiv HQ, seeded outage tomorrow + low readiness stock
   → Resilience tab shows PREPARE/HIGH with a plain-language recommendation
   and a Kyiv-time procurement deadline.
2. **Scenario B** — switch to the Дніпро office → ACTIVE_BLACKOUT, and the
   Branch Resilience card explains the generator-branch situation honestly
   (found in the snapshot, but no confirmed Silpo branch-ID match) — no
   cart is touched.
3. **Scenario C** — the honest "nothing configured yet" fallback, proven
   via automated tests + reading the provider's early-return path — the
   app never claims a fake LIVE status.
4. **Scenario D** — log a new battery drop-off on Office Setup, watch the
   ESG card update live on the Resilience screen too.
5. Throughout: accessibility mode and a non-default accent color both
   render correctly on every new card — nothing about V1's theming or
   accessibility work was bypassed.

## Honest limitations (see `LIMITATIONS.md` for the full list)

No live DTEK integration exists or was faked. No live re-verification
against the real Silpo MCP happened in this session (mock mode only,
consistent with V1's own SILPO_MODE pattern). No environmental-impact
numbers are computed. Multi-office support is narrow (one selector on one
tab), not a general multi-tenant rebuild. All of this is stated plainly
rather than glossed over, in keeping with this project's running
commitment to not overstate what's actually built.
