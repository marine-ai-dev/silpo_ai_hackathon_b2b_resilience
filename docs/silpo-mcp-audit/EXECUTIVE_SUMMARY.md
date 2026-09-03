# Executive Summary — Silpo MCP Capability Audit

Audit date: 2026-09-02. Server: `silpo` (`https://mcp.silpo.ua/mcp`). Full detail in [README.md](README.md) and the numbered docs in this folder.

## 1. Tools discovered
**40** (33 read-only, 7 state-changing). Full list: [02-tools-inventory.md](02-tools-inventory.md), [tool-inventory.json](tool-inventory.json).

## 2. Resources discovered
**0** — not exposed by this MCP server.

## 3. Prompts discovered
**0** — not exposed by this MCP server.

## 4. Main MCP capability groups
Account/profile · Delivery & geo setup (incl. a `B2B` delivery type) · Catalog & search · Promotions/coupons/certificates/loyalty · Shopping cart lifecycle (create/read/add/remove/clear/configure) · Order & receipt history (read-only).

## 5. Most important Silpo objects/entities
Profile, Branch, Product/SKU (branch+timeslot-scoped), Category, Cart / Cart Shipment / Cart Product Line, Cart Calculation (`total`, `totalAfterDiscounts`, `validations[]`), Delivery Type/Address/Slot, Order (online, read-only) and Receipt (offline, read-only), Coupon/Promotion, Loyalty balance, Gift Certificate. See [03-domain-model.md](03-domain-model.md) for the full graph.

## 6. Most powerful end-to-end workflows
- **Search → resolve real SKUs in bulk** (`silpo_find_products_batch`, up to 30 terms/call, numeric-code precision matching).
- **Full cart lifecycle**: discovery → add products → configure delivery (incl. `B2B` channel) → apply promo/bonus/certificate → re-verify `validations[]` and `totalAfterDiscounts` — everything short of checkout.
- **Repeat-purchase resolution**: order/receipt history → `lagerId`/`externalProductId` → precise re-search → re-add to cart.

See [04-supported-workflows.md](04-supported-workflows.md) for exact tool chains, including the one workflow that is **not** supported (checkout/order placement).

## 7. Top B2B-relevant capabilities (native)
Catalog breadth (28 categories), branch/timeslot-aware pricing & stock, promotions, cart budget-total visibility (`totalAfterDiscounts`), delivery-slot/type selection including a genuine `B2B` delivery type, fulfilment-risk detection (`silpo_get_replacements`), loyalty/bonus and certificate application. Full classification: [05-b2b-capability-matrix.md](05-b2b-capability-matrix.md).

## 8. Major missing B2B capabilities
**No order-placement/checkout tool at all** — every write workflow stops at a fully priced, valid cart. No company/tenant, employee, role, budget, spending-limit, approval-workflow, procurement-policy, recurring-order/subscription, multi-office, or notification concept anywhere in the schema. Details incl. explicit investigation of each: [07-gaps-and-limitations.md](07-gaps-and-limitations.md).

## 9. Candidate agent opportunities
Procurement/Cart Agent (the only agent that writes to Silpo), Consumption/Demand Forecasting Agent, Budget Agent, Approval Agent (human-gate packager), Delivery/Scheduling Agent, Meal/Preference Planning Agent. Three candidates were explicitly rejected as artificial (standalone Order Agent, standalone Product Selection Agent, standalone Loyalty Agent) — see [06-agent-opportunities.md](06-agent-opportunities.md) for why.

## 10. 10–15 strongest MCP tools for this project
`silpo_find_products_batch`, `silpo_add_or_update_cart_products`, `silpo_get_shopping_cart_by_id`, `silpo_get_available_delivery_types` (B2B discovery), `silpo_get_replacements`, `silpo_get_my_online_orders`/`silpo_get_my_offline_orders`, `silpo_get_promotions`, `silpo_get_time_slots` + `silpo_update_shopping_cart`, `silpo_get_categories_tree`, `silpo_get_my_food_restrictions`, `silpo_get_loyalty_info`, `silpo_remove_cart_products`/`silpo_clear_shopping_cart`. Ranked with rationale in [08-hackathon-opportunities.md](08-hackathon-opportunities.md).

## 11. Important constraints / risks
- **Single consumer account scope**: everything is authenticated as one individual loyalty account, not a company account — every "B2B" feature beyond the delivery-type label must be built by us.
- **No checkout tool**: the application ceiling with this MCP alone is "hand a human a ready, approved, priced cart" — not full autonomous purchasing.
- Cart-scoped catalog calls require `branchId` + `deliveryType` + a valid `timeslot`; the sample account's saved cart had a **stale timeslot** (`validations[].message: "timeslot.not_found"`) at audit time — agents must always re-validate before writing.
- `silpo_add_or_update_cart_products` does not itself validate stock; a mandatory re-read of `silpo_get_shopping_cart_by_id` is required after every cart write.
- `silpo_get_my_offline_orders` caps at 10 results/call; `silpo_find_products_batch` caps at 30 search terms/call.

## 12. Questions to answer before choosing the MVP
1. Do we operate the whole hackathon demo through **one shared Silpo account** representing "the office," or do we need multiple test accounts to simulate multiple employees?
2. Given there is no checkout tool, is the MVP's end state explicitly "agent prepares and gets a human-approved cart, human completes checkout in Silpo," and do we message that honestly in the demo?
3. Where does budget/approval/employee-preference data live for the hackathon — a lightweight local store, or something more real? (Deferred to product/MVP planning, per Phase 6 instruction not to decide it here.)
4. Is the discovered `B2B` delivery type worth featuring prominently, or is it a minor logistics detail versus the bigger gap (no B2B account layer)?
5. How much of "demand forecasting" can honestly be demoed given the sample account had only 1 historical online order — do we need seeded/synthetic consumption data for a convincing demo?

---

# Completion Report

- **MCP connection status:** Connected and authenticated (single consumer account, verified live via `silpo_get_my_profile`).
- **Tools discovered:** 40 (33 read-only, 7 state-changing).
- **Resources discovered:** 0.
- **Prompts discovered:** 0.
- **Read-only validation calls performed:** 12 (profile, cart id, cart detail, loyalty info, branches list, food restrictions, family, coupons, online orders, product search ×1 call/2 terms, category tree, available delivery types) — full log in [00-live-validation-log.md](00-live-validation-log.md). No write/transactional tool was called.
- **Files created:**
  - `docs/silpo-mcp-audit/README.md`
  - `docs/silpo-mcp-audit/EXECUTIVE_SUMMARY.md`
  - `docs/silpo-mcp-audit/00-live-validation-log.md`
  - `docs/silpo-mcp-audit/01-server-capabilities.md`
  - `docs/silpo-mcp-audit/02-tools-inventory.md`
  - `docs/silpo-mcp-audit/03-domain-model.md`
  - `docs/silpo-mcp-audit/04-supported-workflows.md`
  - `docs/silpo-mcp-audit/05-b2b-capability-matrix.md`
  - `docs/silpo-mcp-audit/06-agent-opportunities.md`
  - `docs/silpo-mcp-audit/07-gaps-and-limitations.md`
  - `docs/silpo-mcp-audit/08-hackathon-opportunities.md`
  - `docs/silpo-mcp-audit/tool-inventory.json`
- **Blockers:** None. The one deviation from the phase order in the prompt is that resource/prompt discovery had nothing to report (both are absent), so Phase 1 output on those points is a firm "not exposed" rather than a partial finding.

We will review the audit before making any product decisions. Stopping here as instructed.
