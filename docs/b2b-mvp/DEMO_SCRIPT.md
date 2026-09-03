# DEMO_SCRIPT.md — live walkthrough for judges

Assumes `npm install` has been run. `SILPO_MODE` defaults to `mock`, so no
Silpo authentication is needed for the mock-mode script below (steps 1-10).

## 0a. (Live-mode path only) Connect Silpo

If demoing `SILPO_MODE=live`: start the server, open `http://localhost:3000`,
and click **"Connect Silpo"** in the top-right corner of the header. This
redirects to `mcp.silpo.ua/authorize` and then to the real Silpo login at
`auth.silpo.ua` — log in with a real Silpo account (credentials/OTP). On
success you're redirected back to the dashboard with a "Silpo connected"
toast and the indicator flips to "● Connected". From here the rest of the
script (steps 1-10) runs identically, except proposal line items are
tagged "live" instead of "mock" (see `docs/b2b-mvp/SILPO_OAUTH.md`).

If live OAuth breaks or there's no network during the demo, skip this step
and fall back to `SILPO_MODE=mock` (below) — no code change, same UI,
mock data clearly labeled as such.

## 0. Boot

```
npm run seed     # optional — server auto-seeds on first run if data/db.json is empty/missing
npm start
```

Open `http://localhost:3000`. The header shows `SILPO_MODE=mock`.

## 1. Dashboard tab

Point out: office name, weekly budget (3500 UAH), no runs yet, no alerts
until feedback exists. (There already is seeded feedback — alerts should
show the water NOT_ENOUGH and snacks TOO_MUCH entries.)

## 2. Office Setup tab

Show the office address, budget, category caps (coffee/snacks), and
"prefer promotions: yes" — this is the policy the Budget agent will
enforce later.

## 3. Recurring Supplies tab

Show the standing plan: water/coffee/tea/milk/fruit/snacks, each mapped to
a Silpo category slug and search term. Show the feedback table — point out
the two `NOT_ENOUGH` water entries and the `TOO_MUCH` snacks entry. This is
the human signal the forecast is about to react to.

Optionally: add a new feedback entry live (e.g. `JUST_RIGHT` on tea) to
show it's a real write, not decoration.

## 4. Weekly Run tab

Set week-of (defaults to next Monday) and expected attendance (defaults to
28, above the seeded baseline of 24 members). Click **"Run
Demand → Procurement → Budget pipeline"**.

Narrate the state pills advancing: DRAFT → FORECASTING → SOURCING →
OPTIMIZING → READY_FOR_APPROVAL. This is the orchestrator
(`runWeeklyProcurement`) actually executing the three agents in sequence.

## 5. AI Forecast tab

Show the per-item table. Call out:
- **Water**: previous 40L → forecast ~56L (↑ +16), rationale mentions both
  the attendance scaling *and* the NOT_ENOUGH feedback bump.
- **Snacks**: forecast decreases despite higher attendance, because of the
  TOO_MUCH feedback.
- **Milk**: moves only with attendance scaling — no feedback signal.

This proves the numbers are computed, not hardcoded — different feedback
entries produce different, explainable deltas per item.

## 6. Procurement Proposal tab

Show real resolved Silpo products (fixture catalog): unit prices, line
totals, promo flags, and the same previous→recommended framing with reason
text. Point out the total estimated cost.

## 7. Budget Optimization tab

Show weekly budget vs. optimized cost, and the adjustments list — e.g. a
per-category cap trim on coffee/snacks, or a promotion swap if the total
came in over budget. Scroll the audit trail table to show every action is
timestamped and attributed to an actor (`ProcurementAgent` /
`BudgetPolicyAgent`).

## 8. Approval tab

Enter an approver name (pre-filled), optionally a comment, and click
**Approve**. Narrate: this is a plain workflow transition — no AI involved
— recorded as an `Approval` record.

(Optionally demo **Reject** on a second run to show `CANCELLED` and that
cart preparation is then permanently blocked for that proposal.)

## 9. Silpo Cart Handoff tab

Click **"Prepare Silpo Cart"**. Show the resulting cart id and confirmation
that the cart was re-read with no validation errors. Read the on-screen
note aloud: *this system never places, pays for, or cancels an order —
checkout is a manual human step in the Silpo app*, because no Silpo MCP
tool exists for it (cite the audit).

## 10. Procurement History tab

Show the run just completed, with its final status `CART_PREPARED`, total,
and within-budget flag. Run the pipeline a second time for a different
week to show multiple runs accumulate here.

## Closing line

"Everything below the cart — catalog, pricing, promotions, delivery slots —
is real Silpo infrastructure via MCP. Everything above the cart — forecasting,
budget optimization, approval — is ours, because Silpo's MCP genuinely
doesn't have it. And we stop exactly at a prepared cart, on purpose."
