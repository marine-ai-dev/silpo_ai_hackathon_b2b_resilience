# ROADMAP.md — Future extensions (not built yet)

Ideas captured for a future version, deliberately kept out of the original
MVP scope so the primary demo (adaptive recurring office provisioning)
stayed focused at the time. Several have since been implemented — see the
status updates below, newest first.

## STATUS UPDATE (2026-09-03, V2): connected resilience platform built

A further extension built on top of the three items below: a
`PowerScheduleProvider` abstraction (`src/power/` — `ManualScheduleProvider`
+ `DemoScheduleProvider`, no live DTEK provider, see
`docs/b2b-resilience/DTEK_RESEARCH.md` for why), a deterministic
`riskModel`/`resiliencePlanner` (`src/resilience/`, NORMAL/WATCH/PREPARE/
HIGH/ACTIVE_BLACKOUT/UNKNOWN, no LLM call) that composes power status +
emergency readiness shortfall + branch-failover logistics (reusing
`branchFailover.js` unchanged) + ESG stats into one
`GET /offices/:id/resilience-plan` view, and a new "Resilience" UI tab.
This does NOT replace or duplicate the three features below — it composes
them. No 4th/5th agent was added (`riskModel`/`resiliencePlanner` are
deterministic services, not LLM agents — see `docs/b2b-mvp/AGENTS.md`).
Full design/build docs: `docs/b2b-resilience/` (`ARCHITECTURE.md`,
`RISK_MODEL.md`, `DEMO_SCENARIOS.md`, `LIMITATIONS.md`,
`HACKATHON_NARRATIVE.md`).

## STATUS UPDATE (2026-09-03): all three items below are now implemented

All three roadmap entries in this file were built in this version, scoped
strictly to what was verified (real Silpo search hits for batteries/LED
lighting/candles/extension cords; NO power banks/generators; NO live
blackout-schedule API; the generator-branch page as a manual snapshot, not
a live feed; the real, verified «Батарейки, здавайтеся!» recycling program
tracked as a manual log, not an API). See `docs/b2b-mvp/DATA_MODEL.md` and
`ARCHITECTURE.md` for the actual data model and integration points, and
`docs/b2b-mvp/AGENTS.md` — no 4th agent was added for any of the three;
Features 1 and 2 reuse `ProcurementAgent`/`BudgetPolicyAgent` via the
existing pipeline, and Feature 3 needed no agent at all (pure internal
tracking, no Silpo MCP call).

**What was actually built:**
- Feature 1 ("Emergency Readiness"): `ReadinessItem`/`ReadinessStockCheck`
  collections, `src/agents/readinessAgent.js` (pure stock-gap calculation,
  explicitly NOT a forecast), `procurementOrchestrator.runReadinessTopUp()`
  reusing `ProcurementAgent.buildProposal`/`BudgetPolicyAgent.applyPolicy`,
  a `proposalKind: 'readiness-topup' | 'weekly-restock'` tag, a new
  "Emergency Readiness" UI tab, and 5 seeded demo items (batteries AA/AAA,
  LED lamp, candles, extension cord) each with a partial-stock seed check
  so the demo shows a real, resolvable shortfall.
- Feature 2 (blackout-aware branch failover): `GeneratorBranch`/
  `RegionalBlackoutStatus` collections, `src/silpo/branchFailover.js` (pure,
  unit-tested, defensive failover logic) wired into
  `SilpoGateway.resolveDeliveryContext()` as a soft preference with
  graceful fallback, a manual blackout toggle + branch-selection preview in
  the Office Setup UI, and ~22 real `GeneratorBranch` rows seeded from the
  browser-captured snapshot listed below.

**What remains manual/unverified — read this before assuming more
automation exists than actually does:**
- `RegionalBlackoutStatus.active` is set ENTIRELY by a human clicking a
  toggle in the UI. No live DTEK/grid-operator API integration exists or
  was found to exist for Ukraine (still fully unresearched beyond the
  original web-search pass below — see "still fully open" note).
- `GeneratorBranch` is a one-time manually-captured snapshot (~22 rows,
  the real subset captured in the browser session below) — it is NOT a
  live feed, has no scheduled refresh, and does not cover the full branch
  list Silpo's own page implies (cluster counts up to "103" suggest 100+
  branches nationwide; only a fraction are seeded here). Whether a JSON API
  backs that page, and how to reliably match its city/address text to real
  `silpo_list_branches` `branchId`s, are both still open — every seeded row
  has `silpoBranchId: null` (no matching was attempted for this snapshot).
  A stale/incomplete snapshot means the failover simply won't find a match
  and falls back to normal behavior — never a hard failure, but also never
  a guarantee of finding a real generator-backed alternative.
- The demo office (Kyiv HQ, "Київ") is NOT itself in the captured
  generator-branch snapshot, so toggling blackout on for the seeded demo
  office correctly falls back to normal branch selection — this was
  verified as the honest, expected behavior, not a bug.

- Feature 3 ("Battery recycling / eco tracking"): a `RecyclingLogEntry`
  collection (`officeId`, `quantity`, `loggedBy`, `loggedAt`, `note`),
  `GET/POST /offices/:id/recycling-log` routes, and a small card in the
  Office Setup tab (total recycled + drop-off log + a form to add one) —
  built directly, no dedicated background agent needed given the small
  scope. Grounded in the real, web-search-verified «Батарейки, здавайтеся!»
  program (batareiky.ua): 247 Silpo stores collect used batteries in-store
  (≤50/visit), partnered with a European recycling plant with public
  reporting, plus a dedicated phone contact for large office collections
  (099-311-67-96, 097-168-55-76) — cited in the UI copy itself. **This is
  entirely a manual log** — there is no API to verify or automate battery
  drop-offs; the office manager enters a count after each real trip to a
  collection point. 3 seeded demo entries (29 batteries total) show a
  believable few-months history.

---

## Blackout / power-resilience provisioning

**Source of the idea:** raised by the product owner, grounded in the real,
ongoing situation in Ukraine — scheduled and unscheduled power outages
caused by shelling of energy infrastructure. An office-provisioning
assistant that only thinks about coffee and water is missing something
that is now a routine operational reality for Ukrainian offices.

**Concept:** extend the recurring-supply model beyond kitchen consumables
to cover **power/energy resilience items** — the kind of things an office
needs on hand *before* an outage, not scrambled for during one:

- Power banks / portable chargers (enough capacity for the whole team's
  phones/laptops through a multi-hour outage)
- Batteries (for flashlights, radios, small devices)
- Flashlights / headlamps
- Possibly: small UPS units, portable power stations, LED lanterns —
  scope depends on what's actually sourceable (see constraint below)
- Bottled/reserve water and non-perishable snacks specifically sized for
  "we may not be able to leave or order again for N hours," distinct from
  the routine weekly kitchen restock

**How it could fit the existing architecture, at a glance:**

- A new `RecurringSupplyPlan` category (or a distinct `EmergencyReadinessPlan`
  entity, TBD at design time) alongside the existing water/coffee/tea/milk
  /fruit/snacks categories — same Demand → Procurement → Budget pipeline
  could apply, but with different forecasting logic: this isn't
  consumption-driven (nobody "consumes" a power bank weekly), it's
  **readiness-threshold-driven** — e.g. "do we have enough charged capacity
  for the team right now, and is anything due for replacement/battery
  refresh." DemandAgent's trailing-average model doesn't map cleanly here;
  this would need its own, simpler logic (target inventory level vs.
  current known stock), not a forecast in the water/coffee sense.
- Could also plug into `SupplyFeedback`-style signals, but the meaningful
  signal is different: not NOT_ENOUGH/JUST_RIGHT/TOO_MUCH after the fact,
  but more like "outage happened, did we have enough" — a post-incident
  check-in rather than a weekly taste-test.
- Silpo MCP catalog fit is **unverified** — the original audit
  (`docs/silpo-mcp-audit/`) confirmed a `dlia-domu-567` ("Для дому" / home
  goods) top-level category exists with real products, but did not check
  whether power banks, batteries, or portable power stations are actually
  carried in Silpo's assortment. **Before building this, someone needs to
  run real `silpo_get_products`/`silpo_find_products_batch` searches
  against that category (and neighboring ones) to confirm the product
  category actually exists in Silpo's catalog** — don't assume it does.
  If Silpo doesn't carry this assortment, this feature would need a
  second, non-Silpo sourcing path, which is a materially bigger scope
  change than anything else in this roadmap.

**Why it's not in the current MVP:** the current demo is scoped tightly to
the "recurring kitchen restock" story (per `PRODUCT.md`), and the
completion condition for the current build was the live Silpo OAuth +
procurement pipeline. Adding a second, structurally different provisioning
category (readiness-threshold rather than consumption-forecast) is a real
feature, not a tweak — it deserves its own design pass (data model,
forecasting logic, UI) rather than being bolted on ad hoc.

**Suggested next step, when picked up:** start with the catalog-verification
question above (does Silpo actually sell this?), then decide whether it's
a new `RecurringSupplyPlan` category using the existing pipeline, or a
genuinely separate `EmergencyReadinessPlan` flow with its own agent logic.

## Blackout-aware delivery rerouting (branch failover during outages)

**Source of the idea:** same context as above — raised by the product
owner as a follow-on to power-resilience provisioning. The observation:
today `SilpoGateway.resolveDeliveryContext()` picks a branch by geography
(nearest B2B-capable branch to the office address, via
`silpo_get_available_delivery_types`). That's the right default in normal
conditions, but during a blackout in the office's region, the nearest
branch may itself be without power and unable to fulfil/dispatch an order,
even though a branch further away — one running on a generator — could.

**Concept:** before resolving/confirming a delivery branch, cross-check
two external signals:

1. **Is the office's region currently in an active blackout** (scheduled
   or emergency)?
2. **Which Silpo branches are known to run on generators**, so an
   alternate branch can be chosen instead of blindly falling back to
   "nearest" when the nearest one is affected?

For (2), the product owner pointed at a real page Silpo itself publishes:
`https://silpo.ua/de-pracyuiemo-na-generatorax` ("«Сільпо» з генераторами" —
"Where we operate on generators"). A plain HTTP fetch (`WebFetch`, and a
manual `curl`) was blocked with HTTP 403 (Cloudflare bot protection, the
same pattern already seen on `mcp.silpo.ua` during the original MCP
audit) — but **loading it through a real browser session succeeded**, so
here's what's actually confirmed on the page as of 2026-09-03:

  - It's an **interactive Leaflet/OpenStreetMap map** with clustered
    branch-count markers per region (e.g. seeing cluster numbers like "28",
    "103" etc. next to city groupings), plus a **searchable list below the
    map** of individual branches.
  - Each list entry shows: **city + street address**, **opening hours**
    (e.g. "з 08:00 до 23:00"), and **payment methods accepted**
    ("Зняття готівки" / cash withdrawal, "Оплата карткою" / card payment)
    — cities seen in a partial read include Біла Церква, Бориспіль,
    Бровари, Васильків, Вінниця, Дніпро, Дрогобич, Запоріжжя (list
    continues beyond what was captured).
  - The page explicitly states **"Список оновлюється!"** ("the list is
    updated!") — confirming it's actively maintained, not a static
    one-time snapshot.
  - **Still unverified / open questions for whoever picks this up:**
    - Whether a JSON API backs the map/search (very likely, given it's an
      interactive searchable Leaflet map, but this specific check was
      interrupted by a concurrent browser session in this environment and
      needs to be redone — inspect network requests while the page loads
      and while using its search box).
    - Whether listed branches map cleanly to the Silpo MCP's own
      `branchId`s (the generator page shows address/city text, not IDs —
      matching would likely need to go through `silpo_list_branches`'
      `address`/`city` fields as a join key, which is fuzzy/text-based
      unless a cleaner mapping is found).
    - Given Cloudflare blocks plain HTTP fetches, any production
      integration would need either a real browser-driven scrape
      (fragile, needs monitoring for breakage) or a manually-refreshed
      snapshot — a live scraped feed should not be assumed reliable
      without further investigation into whether Silpo offers any
      official feed/API for this data.

For (1) — regional blackout schedules — **no source has been identified or
verified yet at all**. Ukraine's blackout/outage schedules are published
per regional grid operator (e.g. DTEK for Kyiv and several oblasts, and
other regional oператори elsewhere) and change frequently, sometimes with
little notice during emergency (shelling-triggered) outages as opposed to
scheduled rolling blackouts. **This needs real research before design**:
whether any regional operator publishes a public API, whether a
community-maintained aggregator/API already exists, and how reliable/
timely such a source would be for emergency (not just scheduled) outages.
Do not assume any specific API exists — this roadmap entry is a problem
statement, not a solution, until that research happens.

**How it could fit the existing architecture, at a glance:** this would
extend `SilpoGateway.resolveDeliveryContext()` (currently: geocode office
address → `silpo_get_available_delivery_types` → pick nearest/first B2B
option → `silpo_get_time_slots`) with an extra decision step between
"resolve candidate branch(es)" and "commit to one": check the candidate
branch's region against active-blackout data, and if affected, prefer a
generator-backed alternative from the (still-to-be-verified) Silpo
generator-branch list, falling back to the original nearest-branch
behavior whenever blackout/generator data is unavailable or inconclusive
— this should be a resilience *enhancement*, never a hard dependency that
could block the whole pipeline if the external data source is down.

**Why it's not in the current MVP:** it depends on two external data
sources, neither of which has been verified to exist in a usable form yet
(one is confirmed bot-protected, the other hasn't been researched at all).
Building integration code against unverified data shapes would mean
guessing/hallucinating an API contract — exactly what this project's own
audit discipline (`docs/silpo-mcp-audit/`) was built to avoid. This is a
real, valuable idea; it just needs a research pass before a design pass.

**Suggested next step, when picked up:** (1) the generator-branch page's
content is now confirmed (see above) — the remaining work there is
checking for a backing JSON API and working out a reliable
address/city-text-to-`branchId` matching approach against
`silpo_list_branches`; (2) research what blackout-schedule data sources
actually exist and are realistically usable for Ukraine, region by region
— still fully open; only then design the branch-failover logic itself.
