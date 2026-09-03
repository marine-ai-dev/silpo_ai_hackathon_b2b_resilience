# LIMITATIONS.md — what's manual, what's seeded, what's genuinely live

Stated plainly, grouped by how the data actually gets into the system.
Nothing in this document is a TODO disguised as a limitation — everything
here is either a deliberate scope decision (see `DTEK_RESEARCH.md` for the
power-schedule case) or an honestly-labeled placeholder for something that
would need real infrastructure/partnership work beyond a hackathon.

## Genuinely live (real Silpo MCP calls, in mock or live mode)

- Product search/resolution (`silpo_find_products_batch`,
  `silpo_get_products`) — via `ProcurementAgent`/`SilpoGateway`, exercised
  by both the weekly-restock and readiness-topup pipelines, and therefore
  by the resilience plan's `procurement` section indirectly (it reports
  what *would* happen, without calling it).
- Delivery-context resolution (`silpo_get_available_delivery_types`,
  `silpo_get_time_slots`) — via `SilpoGateway.resolveDeliveryContext()`,
  called directly by `resiliencePlanner.js` for the Branch Resilience card.
- Cart preparation (`silpo_add_or_update_cart_products`,
  `silpo_get_shopping_cart_by_id`) — unchanged from V1, reachable only
  through `cartPreparationService`, gated on `proposal.status === 'approved'`.
  The resilience feature adds zero new paths to this — see `ARCHITECTURE.md`.

In this session, only **mock mode** (`SILPO_MODE=mock`) was exercised live
end-to-end (see the session's live-verification notes). Live mode
(`SILPO_MODE=live`) code paths are unchanged from V1 and were not
separately re-verified against the real Silpo MCP in this iteration — V1's
own `docs/b2b-mvp/SILPO_OAUTH.md`/audit already cover that verification for
the underlying calls this feature reuses.

## Manual (human enters real data through the UI)

- **Power schedule** (`ManualScheduleProvider`) — an office manager types
  in the next known outage window after checking DTEK's site/bot/Telegram
  channel themselves. Labeled `MANUAL`, never `LIVE`. See
  `DTEK_RESEARCH.md` — no documented, verifiable official public
  programmatic API for outage schedules was found during this project's
  research; this is a statement about what was found, not a claim that no
  such API exists anywhere (including privately/internally at DTEK).
- **Regional blackout toggle** (`RegionalBlackoutStatus.active`, V1,
  reused) — a human flips this on/off; no automated detection.
- **Emergency readiness stock checks** (`ReadinessStockCheck`, V1, reused)
  — a human counts what's physically on the shelf and enters it.
- **Battery recycling log** (`RecyclingLogEntry`, V1, reused) — a human
  logs a count after each real drop-off trip; no API exists for this at
  Silpo, confirmed in V1's own research.

## Seeded/demo (deterministic, for demonstrating the feature without a real event)

- **`DemoScheduleProvider` data** — only ever written by `scripts/seed.js`,
  never by the running app itself. Labeled `DEMO`, never `LIVE`. Overridden
  automatically the moment a manager enters a manual schedule for the same
  office.
- **`GeneratorBranch` snapshot** (V1, reused) — a one-time,
  manually-captured subset of a real Silpo page, not a live feed; most
  rows have `silpoBranchId: null` (no confirmed catalog match attempted).
- **Scenario B's second office** (`office-dnipro-branch`) — created purely
  so the branch-failover + `ACTIVE_BLACKOUT` path is demonstrable without
  disturbing the primary Kyiv HQ demo office. Its `RegionalBlackoutStatus`
  is seeded `active: true` — in a real deployment, this would be a
  manager's own toggle, not something the app decides on its own.

## Deliberately not built (documented gaps, not oversights)

- **No `DtekLiveProvider`** — see `DTEK_RESEARCH.md` in full. The
  `PowerScheduleProvider` interface exists specifically so this can be
  added later without touching any consumer.
- **No automated GeneratorBranch refresh** — carried over unchanged from
  V1; still a manual snapshot, still `silpoBranchId: null` for every seeded
  row (best-effort text matching against `silpo_list_branches` was never
  attempted, same as V1).
- **No CO2/environmental-impact estimates** — the ESG card shows only real
  counts (batteries logged, drop-off count). No emissions-avoided or
  similar figure is computed or displayed anywhere, because no verified
  conversion factor was sourced — inventing one would be exactly the kind
  of fabricated-impact-statistic this project's rules forbid.
- **No multi-office switching outside the Resilience tab** — the rest of
  the app (Dashboard, Weekly Run, Emergency Readiness UI button, Approval,
  Cart Handoff) still operates on a single primary office
  (`office-kyiv-hq`), matching V1's explicit single-office MVP scope
  (`docs/b2b-mvp/DATA_MODEL.md`: "multi-office/multi-tenant isn't a goal of
  this MVP"). The Resilience tab's office selector is a narrow, additive
  exception built only so Scenario B is viewable — it does not change any
  other screen's behavior, and triggering a readiness top-up for the
  Дніпро office requires calling its API route directly (documented in
  `DEMO_SCENARIOS.md`), not a UI button, since wiring a second office
  through the entire Weekly Run/Approval/Cart-Handoff flow was out of
  scope for this iteration.
- **No dedup/rate-limiting on recycling log or stock-check submissions** —
  matches the spec's explicit instruction that duplicate/rapid submissions
  are allowed, not an oversight.
- **`staleAfterMinutes` thresholds are illustrative defaults**
  (`DemoScheduleProvider`: 6h; `ManualScheduleProvider`: 12h), not tuned
  against any real operational SLA — a real deployment would want these
  configurable per office/company.

## Testing scope honestly stated

- 79 automated tests pass (`npm test`), including new coverage for risk
  classification boundaries, provider selection/precedence, staleness,
  timezone edge cases, and resilience-plan composition (including
  degradation paths). See the final test-run report for the exact count at
  hand-off.
- Live-in-mock-mode verification (this session) covered: `GET`/`PUT`
  power-schedule, `GET resilience-plan` for both scenario offices, the
  unchanged weekly-restock run→approve→prepare-cart flow, and the
  unchanged readiness-topup flow — all confirmed still working end to end
  after this feature's changes.
- `SILPO_MODE=live` was **not** re-exercised against the real Silpo MCP in
  this session (no live credentials were available in this environment) —
  the resilience feature's only new Silpo-facing call
  (`resolveDeliveryContext`) is a call already made and tested by V1's
  weekly-restock pipeline, so the marginal live-mode risk is limited to
  "does this get called at the right time," not "does the underlying call
  work," but this is stated here rather than silently assumed.
