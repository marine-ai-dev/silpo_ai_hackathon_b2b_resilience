# USER_FLOW.md

## Primary flow (office manager)

1. **Dashboard** — see the office, weekly budget, expected attendance on
   the latest run, current run status, and consumption alerts (recent
   non-`JUST_RIGHT` feedback).
2. **Office Setup** — review office identity, budget, and procurement
   policy (category caps, banned categories, promo preference).
3. **Recurring Supplies** — see the standing weekly plan (water, coffee,
   tea, milk, fruit, snacks) and log feedback (`NOT_ENOUGH` /
   `JUST_RIGHT` / `TOO_MUCH`) on any item.
4. **Weekly Procurement Run** — pick a week + expected attendance, click
   "Run pipeline". Watches the `ProcurementRun` state pills advance
   live: DRAFT → FORECASTING → SOURCING → OPTIMIZING →
   READY_FOR_APPROVAL.
5. **AI Forecast** — see DemandAgent's per-item forecast with previous
   quantity, new quantity, delta, and a plain-English rationale sentence
   per item.
6. **Procurement Proposal** — see ProcurementAgent's resolved real Silpo
   products: previous → recommended quantity with delta and reason, unit
   price, line total, promo flag.
7. **Budget Optimization** — see BudgetPolicyAgent's work: weekly budget
   vs. optimized cost, the list of adjustments made (swaps/trims/bans),
   and the full timestamped audit trail.
8. **Approval** — a named approver clicks Approve or Reject with an
   optional comment. This flips `ProcurementProposal.status` and
   `ProcurementRun.status` — a plain workflow transition, recorded as an
   `Approval`.
9. **Silpo Cart Handoff** — once approved, click "Prepare Silpo Cart".
   The system gets-or-creates a Silpo cart, adds every line item via a
   real (or mocked) `silpo_add_or_update_cart_products` call, re-reads the
   cart to confirm no validation errors, and shows the resulting cart id
   and snapshot. A visible note reminds the user that checkout/payment is
   a manual step in the Silpo app — this system does not and cannot do it.
10. **Procurement History** — every past run for the office: week, status,
    total, within-budget flag, start time.

## Rejection path

If a proposal is rejected at step 8, the run moves to `CANCELLED` and the
"Prepare Silpo Cart" action is permanently unreachable for that proposal
(enforced in `cartPreparationService`, not just hidden in the UI).

## Re-running a week

Nothing prevents running the pipeline again for the same office/week (e.g.
after adjusting feedback) — each run creates a new `ProcurementRun` +
`DemandForecast` + `ProcurementProposal`, all visible in History.
