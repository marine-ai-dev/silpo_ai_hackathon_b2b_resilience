# 08 — Hackathon Value: Strongest MCP Capabilities for a Demo

Not the final MVP choice — a ranked shortlist of what would make the strongest, safest, most visibly "agentic" demo, drawn only from what actually exists.

### 1. `silpo_get_available_delivery_types` → the `B2B` delivery type
**WHY:** It's a genuine, verified surprise finding — the underlying Silpo platform already models business delivery.
**PROBLEM SOLVED:** Credibility — shows the demo isn't just reusing consumer grocery shopping cosmetically.
**SAFE TO DEMO:** Yes, fully read-only.
**"Agent does work for me" moment:** Medium — mostly a trust signal, not an interactive moment.

### 2. `silpo_find_products_batch` (multi-term + numeric-code search)
**WHY:** One call resolves an entire office shopping list (water, coffee, milk, snacks…) to real, priced, in-stock SKUs.
**PROBLEM SOLVED:** "I don't want to search 10 products one at a time."
**SAFE TO DEMO:** Yes.
**Moment:** High — watching a whole basket resolve in one shot is visually strong.

### 3. `silpo_add_or_update_cart_products` + mandatory `silpo_get_shopping_cart_by_id` reread
**WHY:** The actual write path that proves the agent can act, not just suggest.
**PROBLEM SOLVED:** Turns a recommendation into a real, priced cart.
**SAFE TO DEMO:** Yes, if done live with user consent (this is a WRITE — must be demoed deliberately, not during the audit itself).
**Moment:** Very high — the core "agent does work for me" beat of the whole demo.

### 4. `cart.calculation.total` / `totalAfterDiscounts` / `validations[]`
**WHY:** Gives a Budget Agent an authoritative, real-time number to enforce policy against.
**PROBLEM SOLVED:** "Don't let the office overspend."
**SAFE TO DEMO:** Yes (read-only inspection).
**Moment:** High — "the agent kept us under budget" is a clean, understandable payoff.

### 5. `silpo_get_replacements` + `silpo_get_similar_products`
**WHY:** Real fulfilment-risk detection beyond a naive stock check.
**PROBLEM SOLVED:** "Don't let my order silently fail because the picker can't find an item."
**SAFE TO DEMO:** Yes.
**Moment:** Medium-High — a good "agent anticipated a problem" beat.

### 6. `silpo_get_my_online_orders` / `silpo_get_my_offline_orders`
**WHY:** Real historical data to seed a forecasting/repeat-order narrative.
**PROBLEM SOLVED:** "What did we buy before, and how much?"
**SAFE TO DEMO:** Yes.
**Moment:** Medium — good as forecasting input, not visually dramatic alone.

### 7. `silpo_get_promotions` / `mustHavePromotion` filter
**WHY:** Lets the Budget Agent visibly stretch a fixed budget further.
**PROBLEM SOLVED:** "Get more for the same money."
**SAFE TO DEMO:** Yes.
**Moment:** Medium.

### 8. `silpo_get_time_slots` + `silpo_update_shopping_cart` (delivery config)
**WHY:** Shows end-to-end logistics, not just a shopping list.
**PROBLEM SOLVED:** "When will this actually arrive at the office?"
**SAFE TO DEMO:** Read part yes; write part needs explicit demo consent.
**Moment:** Medium.

### 9. `silpo_get_categories_tree`
**WHY:** Demonstrates full assortment breadth (28 categories) backing the "office provisioning" pitch (not just snacks — cleaning, hygiene, health).
**PROBLEM SOLVED:** Establishes scope credibility.
**SAFE TO DEMO:** Yes.
**Moment:** Low-Medium — supporting evidence, not a headline moment.

### 10. `silpo_get_my_food_restrictions`
**WHY:** Direct, real hook for the "employees select meal preferences" pillar, even though it's single-account today.
**PROBLEM SOLVED:** Personalized food ordering.
**SAFE TO DEMO:** Yes.
**Moment:** Medium — works best combined with our own multi-employee layer on top.

### 11. `silpo_get_loyalty_info` + `silpo_update_shopping_cart.bonusRequested`
**WHY:** Shows the agent squeezing extra value (bonus points) out of an order.
**PROBLEM SOLVED:** "Don't leave loyalty value on the table."
**SAFE TO DEMO:** Read part yes; write part needs consent.
**Moment:** Low-Medium — a nice-to-have flourish, not core.

### 12. `silpo_get_shopping_cart_by_id` (validations[] surfacing real errors, e.g. observed `timeslot.not_found`)
**WHY:** Concrete proof the agent double-checks its own work before handing off to a human.
**PROBLEM SOLVED:** Trust — "the agent caught a problem before I would have."
**SAFE TO DEMO:** Yes.
**Moment:** High if staged well (show a stale cart, then the agent fixing it).

### 13. `silpo_get_products` price/stock/sort filters
**WHY:** Lets a Procurement Agent optimize (cheapest in-stock option per category).
**PROBLEM SOLVED:** Cost efficiency without manual comparison shopping.
**SAFE TO DEMO:** Yes.
**Moment:** Medium.

### 14. `silpo_list_branches` (455 branches nationwide, `hasPickup` flag)
**WHY:** Shows the platform can plausibly support many office locations even though multi-office logic itself is ours.
**PROBLEM SOLVED:** Credibility for a multi-office growth story.
**SAFE TO DEMO:** Yes.
**Moment:** Low — background credibility only.

### 15. `silpo_remove_cart_products` / `silpo_clear_shopping_cart`
**WHY:** Completes the "adjust quantities based on feedback" loop (remove/reset, not just add).
**PROBLEM SOLVED:** "Too much of X" needs to actually shrink the cart, not just stop growing it.
**SAFE TO DEMO:** Yes with consent (write).
**Moment:** Medium — pairs well with #3 for a full "increase/decrease" demo beat.

---

**Read-only items above (1, 2, 4, 5, 6, 7, 9, 10, 12, 13, 14)** can be demonstrated at any time with zero risk. **Write items (3, 8 write half, 11 write half, 15)** should only be exercised in a deliberate, consented demo step — they were intentionally **not executed** during this audit per the Phase 5 constraint.
