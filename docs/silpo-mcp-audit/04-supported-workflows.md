# 04 — Workflow Reconstruction

Only workflows fully coverable by the actual 40 tools are listed. Each ends at the last point the MCP can take you — several stop short of a real order.

---

### A. Product discovery (browse by category)
```
Step 1 → silpo_get_my_shopping_cart          (get shoppingCartId, or bootstrap via silpo_find_address → silpo_get_available_delivery_types → silpo_get_time_slots → silpo_create_shopping_cart)
Step 2 → silpo_get_shopping_cart_by_id       (get branchId, deliveryType, timeslot)
Step 3 → silpo_get_categories_tree           (browse category hierarchy)
Step 4 → silpo_get_products (category=...)   (list SKUs in a category)
```
**INPUT DEPENDENCIES:** branchId/deliveryType/timeslot from step 2 feed every later call.
**RESULT:** paginated product list with price/stock/promo flags.
**SIDE EFFECT:** none.

---

### B. Search → product details
```
Step 1 → silpo_find_products_batch (products: ["вода", "кава", ...])
Step 2 → silpo_get_product_details (slug from step 1 result)
```
**RESULT:** full attributes/nutrition/images for one SKU.
**SIDE EFFECT:** none.

---

### C. Product → availability / fulfilment risk
```
Step 1 → silpo_find_products_batch or silpo_get_products
Step 2 → silpo_get_replacements (productIds from step 1)
```
**RESULT:** flags SKUs at risk of not being picked/assembled even if `stock>0`, plus substitute candidates.
**SIDE EFFECT:** none.

---

### D. Product → cart (add items)
```
Step 1 → silpo_get_my_shopping_cart
Step 2 → silpo_find_products_batch / silpo_get_products   (resolve productId, companyId, branchId, stock)
Step 3 → silpo_add_or_update_cart_products                 (WRITE)
Step 4 → silpo_get_shopping_cart_by_id                      (MANDATORY reread — verify no stock/budget errors in validations[])
```
**SIDE EFFECT:** cart state changes. **NOT executed in this audit.**

---

### E. Existing cart inspection
```
Step 1 → silpo_get_my_shopping_cart
Step 2 → silpo_get_shopping_cart_by_id
```
**RESULT:** products, delivery config, `calculation.total` / `totalAfterDiscounts`, `validations[]`.
**SIDE EFFECT:** none. **Executed live in this audit (see 00-live-validation-log.md).**

---

### F. Cart creation / modification (delivery config)
```
Step 1 → silpo_find_address
Step 2 → silpo_get_available_delivery_types (lat/lon from step 1)
Step 3 → silpo_list_branches (only if SelfPickup/NovaPoshta and branchId is null)
Step 4 → silpo_get_time_slots (branchId from step 2/3)
Step 5 → silpo_create_shopping_cart                          (WRITE, idempotent per user)
Step 6 → silpo_get_shopping_cart_by_id                        (confirm)
```
**SIDE EFFECT:** creates a cart shell (no products) if none existed. **NOT executed** (this account already had a cart).

---

### G. Delivery configuration change (incl. switching to B2B channel)
```
Step 1 → silpo_get_shopping_cart_by_id        (get current address/shipments to copy forward)
Step 2 → silpo_get_available_delivery_types   (confirm B2B / other types available at the address)
Step 3 → silpo_update_shopping_cart (deliveryType="B2B", timeslot, address, shipments copied from step 1)  (WRITE)
Step 4 → silpo_get_shopping_cart_by_id        (MANDATORY reread)
```
**SIDE EFFECT:** changes cart delivery type/branch, potentially payment options. **NOT executed** — but schema-confirmed as reachable (see key finding on `B2B` delivery type).

---

### H. Order preparation (cart → checkout-ready state)
```
Step 1 → (workflow D to fill cart)
Step 2 → silpo_get_promotions / silpo_get_products(mustHavePromotion) (optimize for promos)
Step 3 → silpo_update_shopping_cart (promoCode, bonusRequested)        (WRITE — financial side effect)
Step 4 → silpo_add_or_update_certificates (optional)                    (WRITE — financial side effect)
Step 5 → silpo_get_shopping_cart_by_id                                   (confirm calculation.totalAfterDiscounts within budget)
```
**RESULT:** a fully priced, discount-applied cart, `validations[]` empty of errors.
**SIDE EFFECT:** cart totals change. **NOT executed.**

---

### I. Order creation (checkout / place order)
**NOT SUPPORTED.** No tool in this MCP transitions a cart into a placed order. Workflow H is the furthest the MCP goes. See [07-gaps-and-limitations.md](07-gaps-and-limitations.md).

---

### J. Order status tracking
```
Step 1 → silpo_get_my_online_orders (limit, offset)
```
**RESULT:** historical orders with a `status` field (only value observed: `"received"`; other statuses e.g. in-transit/cancelled are unconfirmed — no live order in another state was available to inspect). No dedicated "track a single order by id in real time" tool was found; `silpo_get_my_online_orders` is a list/history endpoint, not a live-tracking one.
**SIDE EFFECT:** none.

---

### K. Repeat / replenishment flow (manual, agent-assisted)
```
Step 1 → silpo_get_my_online_orders  OR  silpo_get_my_offline_orders   (source products.id / lagerId)
Step 2 → silpo_find_products_batch (numeric search using lagerId/externalProductId — most precise match)
Step 3 → workflow D (add resolved products to cart)
```
**RESULT:** a new cart pre-populated with previously-bought SKUs.
**SIDE EFFECT:** cart state changes (step 3). **This is the closest native building block to "reorder my usual office basket," but it is manual/agent-orchestrated — the MCP itself has no one-call "reorder" tool.**

---

### L. Promotions / coupons
```
Step 1 → silpo_get_promotions (branchId, deliveryType, timeslot)
Step 2 → silpo_get_products (promotionCode from step 1)
```
and, separately:
```
Step 1 → silpo_get_my_coupons
Step 2 → silpo_get_coupon_details (businessCouponId)
```
**SIDE EFFECT:** none (read-only browse). Applying a promo code to cart is workflow H (write).

---

### M. Loyalty / bonus flow
```
Step 1 → silpo_get_loyalty_info                (balance)
Step 2 → silpo_get_shopping_cart_by_id          (cart.loyalty.bonusAvailable)
Step 3 → silpo_update_shopping_cart (bonusRequested = amount)   (WRITE — financial side effect)
```
**SIDE EFFECT:** allocates loyalty bonus against cart total. **NOT executed.**

---

### N. User / account flow
```
Step 1 → silpo_get_my_profile
Step 2 → silpo_get_my_family
Step 3 → silpo_get_my_food_restrictions
Step 4 → silpo_get_my_delivery_addresses
Step 5 → silpo_get_my_premium_subscription
```
**RESULT:** a composite personal profile (identity + household + diet + saved addresses + subscription status). **This is single-account only — it cannot be composed into a multi-employee office profile.**

---

## Workflow coverage summary

| Workflow | Supported end-to-end by MCP? |
|---|---|
| A–C Discovery/search/availability | ✅ Fully |
| D Product → cart | ✅ Fully (write, unexecuted) |
| E Cart inspection | ✅ Fully (executed) |
| F Cart/delivery creation | ✅ Fully (write, unexecuted) |
| G Delivery config incl. B2B channel | ✅ Fully (write, unexecuted) |
| H Order preparation (pricing/promo/bonus) | ✅ Fully (write, unexecuted) |
| I **Order creation / checkout** | ❌ **Not supported** |
| J Order status tracking | ⚠️ Partial (history list only, no live tracking) |
| K Repeat/replenishment | ⚠️ Partial (manual composition of read+write tools, no native "reorder" call) |
| L Promotions/coupons | ✅ Fully |
| M Loyalty/bonus | ✅ Fully (write, unexecuted) |
| N User/account | ⚠️ Partial (single-account only, no org/employee concept) |
