# Risk model

`src/resilience/riskModel.js` — pure, deterministic, unit-tested. No LLM
call anywhere in this file. Given the same inputs, always returns the same
output; every level comes with a `reasons[]` array explaining WHY, so the
UI never shows an opaque generated sentence.

## Inputs

```js
classifyRisk({
  currentStatus,     // 'normal' | 'active_blackout' | 'unknown'
  nextOutage,         // { start, end } | null (ISO datetimes)
  totalShortfall,     // number >= 0, from readinessAgent.computeShortfalls()
  scheduleStale,      // boolean, from isStale()
  confidence,         // 'high' | 'medium' | 'low'
  now                 // Date, defaults to new Date()
})
```

## Levels and decision order

1. **`ACTIVE_BLACKOUT`** — `currentStatus === 'active_blackout'`. Trumps
   everything else, including staleness/confidence — an active blackout is
   unambiguous regardless of how fresh the schedule metadata is.
2. **`UNKNOWN`** — `currentStatus === 'unknown'` OR `confidence === 'low'`.
   No schedule data (or low-confidence data) to reason about.
3. Otherwise, based on minutes until `nextOutage.start`:
   - **`HIGH`** — outage starts within 6 hours.
   - **`PREPARE`** — outage starts within 24 hours AND `totalShortfall > 0`.
   - **`WATCH`** — outage starts within 24 hours but no shortfall, OR
     outage is further than 24h away but `totalShortfall > 0`, OR no
     scheduled outage at all but `totalShortfall > 0`.
   - **`NORMAL`** — outage more than 24h away (or none scheduled) and no
     shortfall.

`scheduleStale: true` never changes the numeric level on its own — it's
folded into `reasons[]` as an explicit caution, since the underlying
window measurements might be out of date; the UI always shows the STALE
badge separately regardless of level.

## Timing recommendation

`recommendTiming({ nextOutage, now, leadTimeHours = 4 })` — simple,
explainable arithmetic on the outage window, not ML:

- If there's more than `leadTimeHours` until outage start: recommend
  delivery **before outage start**, with a procurement deadline of
  `outageStart - leadTimeHours`.
- Otherwise (not enough lead time): recommend delivery **after outage
  end** instead — you can't beat the clock, so plan for right after power
  is back.
- No known outage window → no recommendation (`null`s, never `NaN`).
- Malformed/unparsable dates → `null`s, never `NaN`/`Invalid Date`.

## Europe/Kyiv timezone handling

All datetime *storage and comparison* uses ISO 8601 strings with explicit
offsets (or `Z`), and `Date` arithmetic under the hood is always
UTC-instant-based — so `minutesUntil()`/`isStale()` are correct regardless
of server timezone.

*Display* is where naive timezone handling usually breaks: `formatKyivTime()`
uses `Intl.DateTimeFormat` with an **explicit `timeZone: 'Europe/Kyiv'`**,
never relying on server-local time or a hardcoded UTC+2/+3 offset (which
would be wrong across the EET/EEST daylight-saving transition). The seed
script's `kyivIsoTomorrowAt()` helper does the same — it computes "tomorrow
14:00 Kyiv time" by probing the actual Kyiv UTC offset for that date via
`Intl`, not by adding a fixed number of hours.

Test coverage (`test/riskModel.test.js`) includes: UTC-input →
Kyiv-wall-clock conversion, `isStale()` boundary/null/invalid-date cases,
`minutesUntil()` null/invalid handling, and every risk-level transition
including the 6h/24h boundaries.

## Explicit non-NaN guarantees

Every numeric path in `riskModel.js` treats `undefined`/`null`/unparsable
input as a safe default (0 for shortfall, `null` for unmeasurable minutes)
rather than propagating `NaN` — asserted directly in
`test/riskModel.test.js` ("shortfall is never NaN/negative-propagated",
"malformed outage dates handled without NaN").
