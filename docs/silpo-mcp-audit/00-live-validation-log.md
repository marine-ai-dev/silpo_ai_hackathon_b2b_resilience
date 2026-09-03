# 00 — Phase 5: Safe Live Validation Log

All calls below are **read-only** (get/list/find semantics). No cart was created, no product was added/removed, no favorite/certificate/coupon was modified, no bonus was requested, no order was placed. The pre-existing cart found on the account was inspected but not mutated.

| # | Tool called | Purpose of call | Key result |
|---|---|---|---|
| 1 | `silpo_get_my_profile` | Confirm authenticated identity | Single consumer account: Марина Антоневич, `profileId 9c3870bd-…` |
| 2 | `silpo_get_my_shopping_cart` | Get cart id without mutating | `exists:true`, `shoppingCartId 06cf56d5-…` |
| 3 | `silpo_get_loyalty_info` | Inspect loyalty structure | Card + balance object; `balance.total 1.47 UAH`, `Moneybox` sub-account exists |
| 4 | `silpo_list_branches` | Inspect branch/store structure & pagination | 455 branches total, page size 50, fields incl. `hasPickup`, `open`, coordinates |
| 5 | `silpo_get_my_food_restrictions` | Inspect dietary-preference structure | Empty for this account — confirms field exists but is account-scoped, not per-employee |
| 6 | `silpo_get_my_family` | Check if "family" could model an office roster | Only 1 member (self), no org/employee semantics |
| 7 | `silpo_get_shopping_cart_by_id` | Inspect full cart/calculation/validations shape | Cart empty, `deliveryType:"DeliveryHome"`, `calculation.validations[]` shows a `timeslot.not_found` **error** and a `payment_types.disabled` **info** — proves the validations array surfaces real pre-checkout blockers |
| 8 | `silpo_get_my_coupons` | Inspect coupon structure | 1 active coupon (referral bonus), confirms `promoId` join key |
| 9 | `silpo_get_my_online_orders` | Inspect order-history structure | 1 historical order, full line items, `status:"received"`, `amount`, `discount`, delivery slot |
| 10 | `silpo_find_products_batch` | Validate multi-term product search | 2 queries ("вода питна", "кава") → 4 products with price/stock/step/displayRatio/externalProductId |
| 11 | `silpo_get_categories_tree` | Validate full category depth | 28 top-level categories confirmed (see domain model) |
| 12 | `silpo_get_available_delivery_types` | **Key discovery call** — check delivery channels at a Kyiv coordinate | Returned 4 types incl. one literally named **`B2B`**, description `"B2B delivery (business orders)"`, with its own `branchId` |

## Notable data-quality observation

`silpo_get_shopping_cart_by_id` on the pre-existing empty cart returned `calculation.validations: [{"level":"error","type":"timeslot","message":"timeslot.not_found", ...}]` — i.e. the account's saved cart currently references a timeslot that is no longer valid/available. This is useful evidence that **carts do go stale** and that any agent building on top of this MCP must always re-validate `timeslot`/`branchId` before adding products, exactly as several tool descriptions already warn.

## Calls deliberately NOT made (per Phase 5 constraints)

- `silpo_create_shopping_cart` — write, not executed (cart already existed anyway).
- `silpo_add_or_update_cart_products` / `silpo_remove_cart_products` / `silpo_clear_shopping_cart` — writes, not executed.
- `silpo_update_shopping_cart` — write (delivery/promo/bonus), not executed.
- `silpo_add_or_update_certificates` — write with financial side effect, not executed.
- `silpo_add_or_update_favorite_products` — write, not executed.
