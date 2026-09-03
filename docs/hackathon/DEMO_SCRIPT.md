# DEMO_SCRIPT.md — 3–5 minute judge demo

All figures below were verified live against the current implementation
immediately before writing this script (`npm run seed` fresh, `SILPO_MODE=mock`).
The exact coverage %, lead-time hours, and prices will drift slightly
between the moment this was written and the moment you demo — that's
expected, since Scenario A's outage is seeded relative to "tomorrow" and
lead time counts down in real time. **Before presenting, glance at the
Resilience tab's Impact Summary card for the current live numbers rather
than reading the figures below verbatim** — they're representative, not a
fixed script you must match exactly.

---

## 0:00–0:30 — Problem

> Ukrainian offices already run recurring procurement — water, coffee,
> office supplies. But today, that planning happens on top of routine
> power interruptions caused by attacks on energy infrastructure. When the
> power goes out, an office needs to already have batteries, light, and
> basic resilience stock on hand — and the delivery that's supposed to
> arrive needs to actually reach a branch that's still operating. Most
> procurement tools don't think about any of this.

Do not say "AI buys office snacks" — that undersells what's actually built
and misdirects the pitch.

## 0:30–1:00 — Solution

> This is **Silpo B2B** — an AI procurement and resilience layer built on
> the real Silpo MCP server. Three deterministic agents — **Demand**,
> **Procurement**, and **Budget & Policy** — already run the weekly office
> restock end to end against Silpo's real product catalog. On top of that,
> a **Resilience Planner** composes power status, emergency stock levels,
> and delivery-branch resilience into one recommendation — with a human
> office manager always approving before anything touches a real Silpo
> cart, and a manual battery-recycling log closing the loop.

## 1:00–3:30 — Live demo (Scenario A: scheduled outage tomorrow 14:00–18:00)

Open the app → **Resilience** tab → office already set to **Kyiv HQ**.

1. **Power situation** — Power Status card shows `PREPARE`/current status
   `normal`, source badge **`DEMO`** (labeled honestly, never `LIVE`),
   next outage tomorrow 14:00–18:00 Kyiv time.
2. **Risk** — the "Why (reasoning)" list under AI Recommendation spells
   out the actual reasons in plain language (e.g. "Next outage starts in
   ~19h — inside the PREPARE window," "Emergency readiness shortfall of
   33 units") — not an opaque LLM sentence. This is deterministic
   arithmetic (`riskModel.js`), not a generated guess.
3. **Emergency-stock coverage** — Impact Summary card: **~21% stock
   coverage**, **5/5 categories below target** (batteries AA/AAA, LED
   lighting, candles, extension cord — the only categories confirmed to
   actually exist in Silpo's catalog).
4. **Recommended procurement** — Emergency Readiness table shows the exact
   per-item shortfall (target vs. current vs. gap).
5. **Silpo product data** — switch to the **Emergency Readiness** tab,
   click "Resolve shortfalls into a proposal." In mock mode this instantly
   returns realistic Silpo-catalog-shaped products; the *same code path*
   was independently verified against the real live Silpo MCP in the prior
   hardening pass (see `docs/b2b-resilience/LIVE_MCP_VERIFICATION.md`) —
   real prices like ₴119/₴199/₴58.99 batteries/LED, one item honestly
   excluded when the live catalog had no match that run.
6. **Budget decision** — Budget & Policy Agent's notes show real
   optimization happening: promo-swapping AAA batteries and candles to
   cheaper SKUs, then proportionally trimming quantities to land at
   **₴3,402.80 of a ₴3,500 weekly budget** — explained, not hidden.
7. **Procurement timing / delivery shift** — Delivery Recommendation card:
   **~19h procurement lead time**, **4h delivery-window shift** (recommends
   arriving before the outage starts, with a 4-hour buffer).
8. **Branch resilience** — Branch Resilience card, badge reads
   **"Silpo catalog · Mock"** (or **"· Live MCP"** if you're demoing in
   live mode). Switch the office dropdown to **Дніпро Філія** (Scenario B)
   to show `ACTIVE_BLACKOUT` + a genuine, confidence-matched generator
   branch reroute — "match confidence: EXACT" is shown, sourced from a
   real Silpo branch list match, not guessed.
9. **Human approval boundary** — go to the **Approval** tab: the proposal
   sits there, unactioned, until a named manager clicks Approve. Point out
   that `cartPreparationService` is the *only* code path allowed to touch
   a real Silpo cart, and it's hard-gated on `status === 'approved'` —
   this is enforced in code, not just UI convention.
10. **Recycling loop** — Office Setup tab → Battery Recycling card: log a
    drop-off (e.g. 10 batteries), switch back to Resilience → ESG card
    total updates live. Mention this ties into Silpo's real
    «Батарейки, здавайтеся!» program (247 stores, real phone contact for
    office-scale collection — cited in the UI copy itself).

## 3:30–4:20 — Why MCP matters

> Every product, price, and delivery-branch decision you just saw is
> resolved through the real Silpo MCP server — `silpo_find_products_batch`,
> `silpo_get_available_delivery_types`, `silpo_get_time_slots` — the exact
> tools documented in our own 40-tool audit of that server
> (`docs/silpo-mcp-audit/`). **This specific demo run is in deterministic
> `SILPO_MODE=mock` for reliability in front of judges** — the same
> resilience pipeline was separately verified live against the real,
> authenticated Silpo MCP during our hardening pass, including a genuine
> live product search and a genuine live branch/delivery-context
> resolution (full record: `docs/b2b-resilience/LIVE_MCP_VERIFICATION.md`).
> We never label mock or demo data as live — the source badges you saw
> come from runtime state, not a hardcoded string.

## 4:20–5:00 — Social value

> This helps a business prepare *earlier* instead of scrambling once the
> power is already out — deciding what to buy, when to order it, and
> which branch can actually fulfill it, while keeping a human in control
> of the actual purchase. And it closes a real loop: batteries bought for
> resilience eventually get logged for recycling through Silpo's existing
> program, not thrown away. We're not claiming this predicts attacks or
> prevents outages — it's operational readiness, not prophecy — and we're
> not going to hand you a made-up "lives saved" number. What you saw is
> what's real: a working pipeline, real Silpo data, a human approval gate,
> and an honest accounting of what's live versus manually entered.

---

## Metrics verified for this write-up (re-check before presenting)

Captured via `curl localhost:3000/api/offices/office-kyiv-hq/resilience-plan`
on a fresh `npm run seed`, `SILPO_MODE=mock`:

```json
{
  "risk": "PREPARE",
  "stockCoveragePercent": 21,
  "categoriesBelowTarget": "5 / 5",
  "procurementLeadTimeHours": "~19 (18.9–19.3 observed across two checks minutes apart — time-dependent, expected to drift)",
  "deliveryWindowShiftHours": 4
}
```

Readiness-topup proposal (mock mode) for reference:
`totalEstimated: 3402.80 UAH` against a `3500 UAH` weekly budget, with two
promo-swap optimizations and one proportional trim logged in
`BudgetPolicyAgent`'s notes.
