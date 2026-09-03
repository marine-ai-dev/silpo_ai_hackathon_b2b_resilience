# 07 — Gaps

## A. What Silpo MCP gives us

- A complete, branch/timeslot-scoped grocery & home-goods catalog (28 top-level categories) with search, filtering, sorting, pricing, promotions, and stock/picking-risk signals.
- A full pre-checkout cart lifecycle: create, add/remove/clear products, configure delivery (including a distinct **`B2B`** delivery type), apply promo codes, request loyalty-bonus payment, apply gift certificates, and read back a priced total with validation errors/warnings.
- Read access to one consumer account's identity, loyalty balance, saved addresses, food restrictions, family, favorites, coupons, and past order/receipt history.
- Delivery infrastructure discovery: address geocoding, delivery-type resolution, branch lookup, time-slot availability, Nova Poshta support.

## B. What our application must store itself

- Company/office identity and membership (there is no tenant object in the MCP at all).
- Employee roster, roles, and per-employee food preferences/restrictions (the MCP's restriction/family objects are single-account, not multi-employee).
- Budget definitions, spending limits (overall and per-category), and spend-to-date tracking.
- Approval policy and approval state (who must sign off, thresholds, audit trail).
- Procurement policy (allowed categories, banned items, max quantities).
- Standard/recurring basket templates and their schedules.
- Consumption history at the granularity we actually need (per-office, per-employee, per-week) — the MCP's order/receipt history is real but thin (single test account had 1 online order) and not decomposable by employee.
- Notification delivery (email/Slack/etc. — nothing exists in the MCP for this).
- Multi-office mapping (which office maps to which address/branch/cart).

## C. What our AI agents must calculate/reason about

- Demand forecasts per SKU/category from historical + feedback data.
- Quantity adjustments in response to "not enough"/"too much" feedback.
- Budget-fit optimization (trim/substitute to stay under a ceiling), using live promo/price data from the MCP.
- Aggregating many employees' weekly preferences into one concrete basket.
- Resolving free-text/preference items to the correct branch-scoped SKU (via `silpo_find_products_batch`), including handling out-of-stock substitution via `silpo_get_replacements`/`silpo_get_similar_products`.
- Picking an optimal delivery slot/type (incl. considering the newly-discovered `B2B` channel) within a recurrence schedule.

## D. What requires human approval

- Any point where our budget/policy check fails or is ambiguous.
- The final "this is the basket for next week, please confirm" moment before the Procurement Agent commits it to the real Silpo cart (since our own approval semantics don't exist in Silpo, we must gate our own write calls).
- **Actually completing checkout/payment in Silpo** — because no MCP tool does this, a human necessarily has to finish that step through the Silpo app/site (or by whatever mechanism a real B2B account with Silpo actually settles orders, which is outside what this MCP exposes). This is not a "should require approval" design choice — it is a hard requirement imposed by the missing checkout tool.

## E. What appears impossible with the current MCP

- **Order placement/checkout itself.** No tool transitions a cart to a placed order; every workflow in this audit stops at "cart is fully priced and valid."
- **True multi-tenant/company accounts.** All access is scoped to one already-authenticated consumer identity; there is no way for our app to represent "Company X, employee Y" as distinct principals through this MCP.
- **Native recurring orders/subscriptions.** The only "subscription" concept found (`silpo_get_my_premium_subscription` / "Плюхс") is Silpo's own consumer loyalty perk program — unrelated to recurring commerce.
- **Native budgets, spend limits, or approval workflows.**
- **Live order tracking / delivery-status push.** History is retrospective (`status` field, one value observed) with no webhook/notification primitive.
- **Multi-office / multi-cart-per-account.** Only one cart per account was observed, with no naming/labeling mechanism.

## Explicit investigation of specific B2B-sounding concepts (per Phase 8 instruction — do not infer, verify)

| Concept | Investigated in | Verdict |
|---|---|---|
| Subscriptions | `silpo_get_my_premium_subscription` schema + description | Exists, but is a **consumer loyalty perk subscription**, not a recurring-order mechanism. Confirmed absent as an order-recurrence feature. |
| Recurring orders | All 40 tool schemas | **Absent.** No tool schema contains any recurrence/schedule/frequency field. |
| B2B / company accounts | `silpo_get_available_delivery_types` live call | A delivery **type** named `B2B` exists and resolves to a real branch, meaning Silpo's backend supports business-order delivery logistics. **No evidence**, however, of a distinct B2B *account* object, company profile, or B2B-specific tool set beyond this one delivery-type value — it appears to be a delivery-routing distinction, not a full B2B commerce layer, based on what this MCP exposes. |
| Multiple employees | `silpo_get_my_family`, `silpo_get_my_profile` | **Absent** as an org concept — family members are household/personal, not employees, and there is no role/permission field on any of them. |
| Corporate budgets | All 40 tool schemas | **Absent.** |
| Consumption history | `silpo_get_my_online_orders`, `silpo_get_my_offline_orders` | **Present**, but single-account and retrospective only — no aggregation, no per-employee split, no forecasting field. |
| Automatic replenishment | All 40 tool schemas | **Absent.** No auto-reorder, threshold-trigger, or scheduling tool. |
| Approval workflows | All 40 tool schemas | **Absent.** |
