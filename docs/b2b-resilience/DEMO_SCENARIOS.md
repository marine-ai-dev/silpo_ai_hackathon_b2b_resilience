# DEMO_SCENARIOS.md — how to trigger scenarios A–D

All four scenarios are reachable from a clean `npm run seed` without
waiting for a real blackout. Start the server in mock mode:

```
SILPO_MODE=mock npm start
# or: PORT=3999 SILPO_MODE=mock node src/server.js
```

Open the app, click the **Resilience** tab. Use the "Office" dropdown at
the top of that tab to switch between the two seeded offices — **Kyiv HQ**
(the primary office every other tab/screen uses) and **Дніпро Філія**
(seeded only for Scenario B).

## Scenario A — scheduled outage tomorrow, low readiness stock

**Setup (already seeded, nothing to click):** `scripts/seed.js` seeds
`DemoScheduleProvider` for Kyiv HQ with an outage window "tomorrow
14:00–18:00" in Europe/Kyiv wall-clock time (computed DST-safely via
`kyivIsoTomorrowAt()`, not a fixed UTC offset), and the existing V1
Emergency Readiness items are already seeded with partial stock (e.g.
batteries AA at 4/20).

**To see it:** Resilience tab → Office: "Kyiv HQ" (default).

**Expected result:** Risk badge shows `PREPARE` or `HIGH` (label flips to
`HIGH` once the outage is within 6 hours — since "tomorrow 14:00" is a
moving target relative to when you're viewing it, the exact level depends
on the time of day you run the demo; both are valid, expected states for
this scenario. If it shows `WATCH` because you're viewing it more than 24h
before the seeded outage, that's also correct behavior, not a bug — the
"Why" panel explains exactly why). The AI Recommendation card explains the
readiness shortfall and recommends triggering a top-up; the Delivery
Recommendation card shows a procurement deadline computed as "outage start
minus lead time," in Kyiv time.

**To force `HIGH`/`PREPARE` deterministically for a demo:** use the manual
power-schedule form on the Resilience tab to set an outage window a few
hours from now — see Scenario C's form for the exact fields. Manual entry
immediately overrides demo data, per the provider-selection rule.

## Scenario B — active regional blackout, generator-branch alternative

**Setup (already seeded):** a second office, "Дніпро Філія"
(`office-dnipro-branch`), is seeded with `RegionalBlackoutStatus.active =
true` and is a city (`Дніпро`) that DOES have `GeneratorBranch` matches in
the seeded snapshot (unlike Kyiv HQ, which deliberately has none — see
`docs/b2b-mvp/ROADMAP.md`).

**To see it:** Resilience tab → Office: switch to "Дніпро Філія".

**Expected result:** Risk badge shows `ACTIVE_BLACKOUT`. The Branch
Resilience card explains that a generator-backed branch is on record for
Дніпро (`просп. Науки, 3`) but has no confirmed `silpoBranchId` match yet
(the honest best-effort-matching state from `branchFailover.js`, not a
bug) — reasoning is shown plainly, not hidden. **No cart is touched or
mutated by viewing this** — the Emergency Readiness items for this office
each carry their own shortfall, and resolving them into a real proposal
still requires an explicit click on "Resolve shortfalls into a proposal"
on the Emergency Readiness tab (with the office switched, if you want to
drive it for Дніпро specifically via the API — the tab itself operates on
the primary Kyiv HQ office by default, per the app's existing
single-primary-office convention; use `POST
/api/offices/office-dnipro-branch/readiness-runs` directly to trigger it
for Дніпро in a demo).

**To toggle it off and compare:**
```
curl -X PUT localhost:PORT/api/offices/office-dnipro-branch/blackout-status \
  -H 'Content-Type: application/json' \
  -d '{"active": false, "setBy": "Demo"}'
```
Refresh the Resilience tab — risk drops back to whatever the (unseeded)
power schedule + shortfall imply.

## Scenario C — default/fallback, nothing configured

**Setup:** none — this is the state of any *newly created* office with no
`DemoScheduleProvider` seed and no manual entry (neither Kyiv HQ nor
Дніпро Філія are in this state after `npm run seed`, since both have data
seeded for scenarios A/B respectively; to see genuine Scenario C, use a
fresh office).

**To see it directly:**
```
curl -X POST localhost:PORT/api/... # (no office-creation route is exposed by the API;
```
the simplest way to observe Scenario C honestly is via the test suite
(`test/powerProviders.test.js` — "no seed → unavailable/unknown, app stays
functional") or by reading `src/power/DemoScheduleProvider.js`'s
`getSchedule()` early-return branch directly. It returns
`currentStatus: 'unknown'`, `source: 'DEMO'`, and a `sourceNote` explaining
no seed exists — never a fabricated `'LIVE'` badge, and the rest of the
resilience plan (readiness, ESG, logistics) still composes fully around
that honest gap. `resiliencePlanner.js`'s own test
(`test/resiliencePlanner.test.js` — "no schedule, no readiness items ->
NORMAL/UNKNOWN, no NaN anywhere") exercises exactly this path end to end.

**Alternative — see it live in the UI:** clear Kyiv HQ's manual schedule by
never entering one and imagine a deploy before `npm run seed`'s Scenario A
block existed; since this repo always seeds Scenario A for the primary
demo office, the cleanest live proof of Scenario C is the automated test
above, which is the honest and reproducible way to demonstrate the
degrade-gracefully path without deliberately breaking the primary demo
office's data.

## Scenario D — recycling log already has history; new entry updates ESG live

**Setup (already seeded):** Kyiv HQ has 3 seeded `RecyclingLogEntry` rows
(29 batteries total) from V1.

**To see it:**
1. Resilience tab → Office: "Kyiv HQ" → scroll to "ESG — Battery
   Recycling" card → note the current total (29 batteries, 3 drop-offs).
2. Switch to the **Office Setup** tab → "Battery recycling" card → enter a
   quantity (e.g. 10) → click "Log recycling drop-off".
3. Switch back to **Resilience** tab → click "Refresh" (or switch the
   office dropdown and back, which re-fetches) → the ESG card total is now
   39 (29 + 10) and drop-off count is 4.

**Expected result:** the new entry is immediately reflected on both the
Office Setup tab's recycling table (same as V1) and the new Resilience
screen's ESG card — same underlying `recyclingLogEntries` collection, no
separate write path, no fabricated CO2/environmental-impact numbers
anywhere (`resiliencePlanner.test.js` asserts this explicitly).

## Demo metrics ("Impact Summary" card on the Resilience screen)

Deterministic, computed from real tracked data only (`resiliencePlanner.js`'s
`buildMetrics()`, unit-tested in `test/resiliencePlanner.test.js`):

- **Emergency stock coverage %** — `sum(min(current, target)) / sum(target)` across the office's readiness items. `—` (not `0%`) when there are no readiness items at all, so an empty office is never misread as "0% covered."
- **Categories below target** — count of readiness items with a positive shortfall, out of the total configured.
- **Procurement lead time** — hours between now and the computed procurement deadline (only shown when an outage window exists).
- **Delivery window shift** — the lead-time buffer `recommendTiming()` actually used (4h) when it recommends delivery before an outage starts.
- **Generator alternative** — `None` / `Found, not used` / `Used`, driven directly by `branchFailover.js`'s real match-confidence outcome for this run — never a hardcoded value.

**Deliberately not included: a recycling "collection rate %".** That would need a tracked "batteries consumed" quantity as the denominator — this app only tracks target/current stock and total recycled, not consumption — so a percentage here would rest on an invented number rather than a real one. The ESG card instead shows the real counts (total recycled, drop-off count) with no derived rate.

**Deliberately never computed anywhere:** CO2/environmental-impact savings, number of outages prevented nationally, businesses/lives "saved," or any other unsupported societal-impact statistic — `resiliencePlanner.test.js` asserts the string doesn't even appear in a plan's output.

## Resetting to a clean demo state

```
npm run seed
```
Re-seeds all of the above deterministically (Scenario A's "tomorrow"
window recomputes relative to whenever you run it; Scenario B's Дніпро
office and blackout-active flag are always re-created).
