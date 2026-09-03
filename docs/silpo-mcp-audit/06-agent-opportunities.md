# 06 — Agent Opportunities

Only candidates with a concrete decision to make on top of real MCP data are kept. This is not the final architecture — just where agentic behavior earns its place.

---

### 1. Procurement / Cart Agent
**INPUT DATA:** approved office basket (ours), current stock/price/promo data.
**SILPO MCP TOOLS USED:** `silpo_get_products`, `silpo_find_products_batch`, `silpo_get_replacements`, `silpo_get_promotions`, `silpo_add_or_update_cart_products`, `silpo_get_shopping_cart_by_id` (mandatory reread).
**OUR OWN DATA NEEDED:** the approved basket/template, budget ceiling.
**DECISION MADE:** which exact SKU/quantity to add per line item, substituting for stock/picking risk, choosing promo'd SKUs to stretch budget.
**HUMAN APPROVAL NEEDED?** No for execution (mechanical), yes upstream (basket must already be approved by Approval Agent / office manager).
**TRANSACTIONAL RISK:** MEDIUM (writes to a real cart; no payment).
**REAL B2B VALUE:** High — this is the one agent that must exist for any of the scenario to work; it is the only piece that actually talks to Silpo's write API.

---

### 2. Consumption / Demand Forecasting Agent
**INPUT DATA:** `silpo_get_my_online_orders` / `silpo_get_my_offline_orders` history, plus our own logged "not enough/too much" feedback.
**SILPO MCP TOOLS USED:** `silpo_get_my_online_orders`, `silpo_get_my_offline_orders`.
**OUR OWN DATA NEEDED:** office size, historical feedback signals, seasonality — the MCP order history alone is thin (one sample account had exactly 1 online order) and is not per-office.
**DECISION MADE:** projected quantity needed next week per SKU/category.
**HUMAN APPROVAL NEEDED?** No (advisory output feeds the Procurement Agent, which is itself gated).
**TRANSACTIONAL RISK:** NONE (read-only).
**REAL B2B VALUE:** High — directly the "forecasting" pillar of the scenario, but depends on our own consumption log being the primary data source since the MCP's native order history is single-account and does not persist per-employee detail.

---

### 3. Budget Agent
**INPUT DATA:** company budget policy (ours), `cart.calculation.total`/`totalAfterDiscounts`.
**SILPO MCP TOOLS USED:** `silpo_get_shopping_cart_by_id` (read totals), `silpo_get_promotions`/`mustHavePromotion` (to find cheaper substitutes when over budget).
**OUR OWN DATA NEEDED:** budget ceiling, spend-to-date, category-level limits.
**DECISION MADE:** approve/reject/trim a proposed cart against budget; suggest swaps to fit.
**HUMAN APPROVAL NEEDED?** Only for exception cases (over-budget with no fit found).
**TRANSACTIONAL RISK:** NONE (read-only against MCP; enforcement is in our own logic before allowing Procurement Agent to add more).
**REAL B2B VALUE:** High — budgets are core to the "company purchasing rules" pillar, and the MCP conveniently exposes a single authoritative running total to check against, even though the budget concept itself is entirely ours.

---

### 4. Approval Agent (office manager sign-off)
**INPUT DATA:** the proposed cart (from Cart Agent) + `silpo_get_shopping_cart_by_id` for the human-readable total/line items to show the manager.
**SILPO MCP TOOLS USED:** `silpo_get_shopping_cart_by_id` (read-only, to render what needs approving).
**OUR OWN DATA NEEDED:** approval policy (who approves, threshold amounts), approval state machine, notification channel to the manager.
**DECISION MADE:** none by the agent itself — it packages the cart for a **human** decision. This is the one agent whose entire job is to force a human checkpoint.
**HUMAN APPROVAL NEEDED?** Yes — that is its whole purpose.
**TRANSACTIONAL RISK:** NONE.
**REAL B2B VALUE:** High — matches "office manager approval before purchase," and matters because there is no MCP checkout tool anyway (see below): the approval gate happens naturally at the last MCP-reachable state (a fully built, priced cart), right before a human would have to complete checkout manually in the Silpo app/site since this MCP cannot place the order itself.

---

### 5. Delivery / Scheduling Agent
**INPUT DATA:** office address, desired delivery cadence, current cart.
**SILPO MCP TOOLS USED:** `silpo_get_available_delivery_types` (confirm `B2B` channel), `silpo_get_time_slots`, `silpo_update_shopping_cart`.
**OUR OWN DATA NEEDED:** preferred delivery day/window per office, recurrence schedule.
**DECISION MADE:** which timeslot/delivery type to select for a given cycle.
**HUMAN APPROVAL NEEDED?** No (mechanical, within policy).
**TRANSACTIONAL RISK:** MEDIUM (writes cart delivery config).
**REAL B2B VALUE:** Medium — useful, but thin: mostly a wrapper around 2 MCP calls with little independent "reasoning," so its value is more orchestration than intelligence. Worth keeping only if delivery-window optimization (e.g. picking the earliest available B2B slot) is itself a demo-worthy moment.

---

### 6. Meal / Preference Planning Agent
**INPUT DATA:** per-employee food preferences/restrictions (ours — the MCP's `silpo_get_my_food_restrictions` is single-account and cannot represent many employees).
**SILPO MCP TOOLS USED:** `silpo_get_products`/`silpo_find_products_batch` (to resolve preferred items to real, in-stock SKUs), `silpo_get_similar_products` (swap out-of-stock preferences).
**OUR OWN DATA NEEDED:** the entire employee preference model — this is our data, not Silpo's.
**DECISION MADE:** aggregate weekly meal/snack selections into concrete SKU quantities.
**HUMAN APPROVAL NEEDED?** No (feeds into the budget-gated basket).
**TRANSACTIONAL RISK:** NONE (read-only against MCP).
**REAL B2B VALUE:** Medium-High — directly the "employees selecting meals/food preferences for a week" pillar, but almost all of its value comes from OUR data model, not from anything the MCP provides; the MCP is only used to validate/resolve final product picks.

---

### Rejected candidates (not worth a separate agent)

- **"Order Agent"** — rejected as a distinct agent because there is no order-placement tool to wrap; its entire job would be re-exposing `silpo_get_my_online_orders`/`silpo_get_my_offline_orders`, which the Forecasting Agent already consumes directly. Folding it into the Forecasting Agent avoids an agent that exists "because the phase list asked for one."
- **"Product Selection Agent" as separate from Cart/Procurement Agent** — rejected as its own agent; product resolution (name → real SKU) is a single mechanical step inside the Procurement Agent's job, not an independent decision loop.
- **A standalone "Loyalty/Bonus Agent"** — rejected; applying `bonusRequested`/certificates is a one-line optional step inside cart finalization (Procurement Agent), not enough independent decision-making to justify its own agent.

## Cross-cutting note

Every agent above that "acts" ultimately funnels through exactly one write surface: `silpo_add_or_update_cart_products` / `silpo_update_shopping_cart` / `silpo_remove_cart_products` / `silpo_clear_shopping_cart`. Since **no MCP tool places an order**, every agent's real-world ceiling is "hand a human a fully built, priced, approved Silpo cart to finish checking out themselves" — not full autonomous purchasing. This should directly shape MVP scope (see [07-gaps-and-limitations.md](07-gaps-and-limitations.md) and [08-hackathon-opportunities.md](08-hackathon-opportunities.md)).
