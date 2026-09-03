# Resilience platform — architecture

Extends the existing B2B procurement MVP (see `docs/b2b-mvp/ARCHITECTURE.md`)
with a read-mostly "resilience plan" view that composes power status,
emergency readiness shortfall, delivery-branch resilience, and ESG stats
into one place. Nothing in this layer mutates a Silpo cart or bypasses the
existing approval gate.

## New modules

```
src/power/
  PowerScheduleProvider.js   interface/contract, JSDoc only
  ManualScheduleProvider.js  reads/writes powerSchedules (source:'MANUAL')
  DemoScheduleProvider.js    reads/writes powerSchedules (source:'DEMO')
  index.js                   getEffectivePowerSchedule() — MANUAL wins over DEMO

src/resilience/
  riskModel.js         pure, deterministic: classifyRisk(), recommendTiming(),
                        isStale(), minutesUntil(), formatKyivTime()
  resiliencePlanner.js  buildOfficeResiliencePlan(officeId, silpoGateway)
```

Routes added to `src/routes/api.js`:
- `GET /offices/:id/resilience-plan` — the composed plan
- `GET /offices/:id/power-schedule` — effective schedule (MANUAL if set, else DEMO/UNAVAILABLE)
- `PUT /offices/:id/power-schedule` — write via `ManualScheduleProvider`

## Composition, not a new pipeline

`buildOfficeResiliencePlan()` is a service function, not an agent and not a
new orchestrator state machine. It:

1. Reads the effective power schedule (`getEffectivePowerSchedule`).
2. Reads readiness shortfall by calling `computeShortfalls()` from the
   existing `src/agents/readinessAgent.js` — unchanged, reused as-is.
3. Reads `regionalBlackoutStatuses` (existing collection from Feature 2) —
   if `active: true`, it overrides the risk model's `currentStatus` to
   `'active_blackout'` regardless of what the power schedule says, since a
   human-confirmed "power is out right now" signal is more immediate than
   a scheduled future window.
4. Classifies risk via `classifyRisk()` (pure function, see `RISK_MODEL.md`).
5. Computes a timing recommendation via `recommendTiming()`.
6. Calls `SilpoGateway.resolveDeliveryContext(office)` for branch/logistics
   context — the SAME call the procurement pipeline already makes,
   wrapped in a try/catch so a Silpo/MCP failure degrades to
   `logistics.available: false` instead of crashing plan composition.
7. Reads `recyclingLogEntries` (existing collection from the ESG feature)
   for the ESG card.
8. Builds a plain-language `recommendation.summary` string directly from
   the same `reasons[]` the risk model already computed — no LLM call.

The function never triggers `runWeeklyProcurement()` or
`runReadinessTopUp()`. Turning a resilience-plan recommendation into a
real proposal is a separate, explicit action: the manager clicks through
to the existing Emergency Readiness tab's "Resolve shortfalls into a
proposal" button, which calls the unchanged `POST
/offices/:id/readiness-runs` → approval → `prepare-cart` pipeline.

## Not a 4th/5th agent

Per `docs/b2b-mvp/AGENTS.md`'s framing, this project keeps exactly three
LLM-free "agents" (`DemandAgent`, `ProcurementAgent`, `BudgetPolicyAgent`)
plus the explicitly-not-an-agent `readinessAgent`. `riskModel` and
`resiliencePlanner` are additional deterministic services in the same
spirit as `readinessAgent` — plain arithmetic/comparisons, unit-testable,
no LLM call anywhere in the risk-classification or recommendation-text
path. They are not agents and are not counted as a 4th one.

## Provider selection

`SILPO_POWER_PROVIDER` env var can force `'manual'` as the process-wide
default; otherwise `DemoScheduleProvider` is the default. But selection is
actually per-office and MANUAL-first: `getEffectivePowerSchedule(officeId)`
checks whether a `MANUAL` record exists for that office and, if so, always
prefers it over the env-configured default. This means a manager entering
a real schedule via the UI immediately takes over from demo data for that
office, without needing to change any server configuration.

## Graceful degradation, by layer

| Failure | Handling |
|---|---|
| No power schedule configured at all | `currentStatus: 'unknown'`, `source` still labeled honestly, risk → `UNKNOWN` |
| Power schedule stale (`now - lastUpdatedAt > staleAfterMinutes`) | `stale: true` surfaced in `situation.power` and folded into risk reasons |
| Office has no address | `logistics.available: false`, plan still returns fully |
| Silpo MCP call fails/times out | caught in `resiliencePlanner`, `logistics.available: false`, reason includes the error message |
| No `GeneratorBranch` match for a blackout city | `branchFailover.js`'s existing fallback (unchanged) — normal branch selection, reason explains why |
| Readiness stock already at/above target | `totalShortfall: 0`, `procurement.wouldRecommendTopUp: false`, plan says so plainly |
| Malformed manual schedule input | `ManualScheduleProvider.setSchedule()` throws `ManualScheduleProviderError`, route returns 400, never persists `NaN`/`Invalid Date` |
| Office not found | `buildOfficeResiliencePlan` throws, route returns 404 |

See `docs/b2b-resilience/LIMITATIONS.md` for what is deliberately NOT
handled (or not built at all).
