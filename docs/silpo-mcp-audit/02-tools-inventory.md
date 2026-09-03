# 02 — Complete Tool Inventory

**40 tools discovered**, grouped by category. Full machine-readable detail in [`tool-inventory.json`](tool-inventory.json).


## Account

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_profile` | Read | NONE | — | Yes | MEDIUM | Returns name, phone, email, birthday, gender, status of the single authenticated consumer. No company/role/department fields. |
| `silpo_get_my_family` | Read | NONE | — | Yes | LOW | Household members/children/pets — a consumer personalization feature, not an org roster. Could NOT be repurposed to model 'employees'. |
| `silpo_get_my_premium_subscription` | Read | NONE | — | Yes | LOW | Consumer 'Плюхс' subscription status/benefits. |

## Account/Loyalty

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_loyalty_info` | Read | NONE | — | Yes | LOW | Loyalty card + bonus balance for the individual. No corporate loyalty concept. |

## Account/Preferences

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_food_restrictions` | Read | NONE | — | Yes | HIGH | Per-account dietary restrictions (vegan, gluten-free, lactose-free, etc). Directly relevant to employee meal-preference use case, but scoped to ONE account, not per-employee. |

## Cart

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_shopping_cart` | Read | NONE | — | Yes | CRITICAL | Entry point: returns shoppingCartId for the ONE cart tied to this account (exists boolean). Only one active cart per account was observed — no evidence of multiple concurrent/named carts. |
| `silpo_get_shopping_cart_by_id` | Read | NONE | shoppingCartId | Yes | CRITICAL | Full cart detail: products, delivery, calculation.total/totalAfterDiscounts, validations[] (errors/warnings incl. timeslot and payment-type gating), loyalty bonus fields. This is the closest thing to a pre-checkout 'order draft' object exposed by the MCP. |
| `silpo_create_shopping_cart` | **Write** | LOW | addressType, latitude, longitude, deliveryType, timeslot, branchId | Yes | CRITICAL | Idempotent per user (returns existing cart if one exists) but is a write call. NOT executed during this audit (state-changing). |
| `silpo_add_or_update_cart_products` | **Write** | MEDIUM | shoppingCartId, products[].productId, products[].companyId, products[].branchId, products[].quantity | Yes | CRITICAL | Does not itself validate stock; caller must re-fetch cart to see stock-exceeded errors in validations[]. NOT executed (write). |
| `silpo_remove_cart_products` | **Write** | LOW | shoppingCartId, products[].productId | Yes | HIGH | NOT executed (write). |
| `silpo_clear_shopping_cart` | **Write** | MEDIUM | shoppingCartId | Yes | MEDIUM | Destructive to cart contents (not to orders/account). NOT executed (write). |

## Cart/Delivery/Payments

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_update_shopping_cart` | **Write** | MEDIUM | shoppingCartId, deliveryType, timeslot, address, shipments | Yes | HIGH | Also applies promo codes and requests loyalty-bonus payment against the cart (bonusRequested) — i.e. this single tool has a minor financial side effect (bonus allocation), not just delivery config. NOT executed (write). |

## Cart/Payments

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_add_or_update_certificates` | **Write** | MEDIUM | shoppingCartId | Yes | LOW | Applies/removes gift-certificate value against the cart total — financial side effect. NOT executed (write). |

## Catalog

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_categories` | Read | NONE | branchId | Yes | HIGH | Flat/paginated category listing per branch; supports drilling into subcategories via parentId. |
| `silpo_get_categories_tree` | Read | NONE | branchId, deliveryType, timeslotStart, timeslotEnd | Yes | HIGH | Live-validated: 28 top-level categories (fruits/veg, meat, fish, dairy, bakery, ready meals, health, snacks, coffee&tea, drinks, frozen, alcohol, home goods, hygiene, baby, pet). Full grocery+office-consumables assortment confirmed. |
| `silpo_get_category` | Read | NONE | branchId, deliveryType, categorySlug | Yes | MEDIUM | Category detail incl. visibility flag and price range. |
| `silpo_get_popular_categories` | Read | NONE | branchId, deliveryType | Yes | MEDIUM | Trending categories per branch. |
| `silpo_get_product_details` | Read | NONE | branchId, slug, deliveryType, timeslotStart, timeslotEnd | Yes | HIGH | Full attributes/nutrition/images for one SKU. slug must come from a prior search result, cannot be guessed. |
| `silpo_get_product_sets` | Read | NONE | branchId | Yes | MEDIUM | Curated collections (e.g. seasonal sets) — could inspire a 'starter office kit' bundle but is Silpo-curated, not something we can author. |

## Catalog/Fulfilment risk

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_replacements` | Read | NONE | branchId, companyId, productIds, deliveryType | Yes | MEDIUM | Flags picking/assembly risk (not just stock=0) and suggests substitutes — useful for a Procurement Agent to pre-empt failed office deliveries. |

## Catalog/Recommendation

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_similar_products` | Read | NONE | branchId, slug | Yes | MEDIUM | Alternative-product suggestion, e.g. swap coffee brand if out of stock. |

## Catalog/Search

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_products` | Read | NONE | branchId, deliveryType, timeslotStart, timeslotEnd | Yes | CRITICAL | Core catalogue browse tool; at least one filter (category/promotion/set) required. Supports price range, in-stock filter, sorting, pagination. |
| `silpo_find_products_batch` | Read | NONE | branchId, deliveryType, timeslotStart, timeslotEnd, products | Yes | CRITICAL | Live-validated: multi-term search (up to 30 terms/call), also accepts exact numeric article codes (externalProductId) for precise reordering. This is the main bulk-basket-building primitive for a recurring office order (e.g. water+coffee+milk+snacks in one call). |

## Delivery

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_delivery_addresses` | Read | NONE | — | Yes | MEDIUM | Saved personal addresses. Office address would have to be added/managed the same way a personal address is (no distinct 'office address' entity observed). |
| `silpo_get_available_delivery_types` | Read | NONE | latitude, longitude | Yes | CRITICAL | KEY FINDING: returns a delivery type literally named 'B2B' ('B2B delivery (business orders)') alongside DeliveryHome, NovaPoshta, SelfPickup, each resolved to a branchId for the queried coordinates. Confirms Silpo's backend has a B2B delivery channel reachable through this MCP, though no B2B-specific tools (company account, PO, invoice) were found beyond this delivery type. |
| `silpo_get_time_slots` | Read | NONE | branchId | Yes | HIGH | Delivery slot availability per branch; required before creating/updating a cart's timeslot. |

## Delivery/Geo

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_find_address` | Read | NONE | address | Yes | HIGH | Geocodes free-text address -> lat/lon/city/street/house/district. Prerequisite for delivery setup. |

## Delivery/NovaPoshta

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_find_nova_poshta_settlements` | Read | NONE | title | Yes | LOW | Not directly relevant to recurring office delivery, but usable as a fallback delivery channel. |
| `silpo_find_nova_poshta_offices` | Read | NONE | settlementId | Yes | LOW | Pairs with settlements tool. |

## Delivery/Stores

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_list_branches` | Read | NONE | — | Yes | HIGH | 455 branches total nationwide; paginated 50/page. Needed to resolve branchId for SelfPickup/NovaPoshta. |

## Loyalty/Promotions

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_coupons` | Read | NONE | — | Yes | LOW | Consumer coupon list; joins to offline-order rewards via promoId. |
| `silpo_get_coupon_details` | Read | NONE | businessCouponId | Yes | LOW | Detail for one coupon id. |
| `silpo_get_my_promos` | Read | NONE | — | Yes | LOW | Selectable personal promo offers. |

## Order history

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_online_orders` | Read | NONE | — | Yes | HIGH | Live-validated: 1 historical online order returned with full line items, prices, delivery slot, status='received'. This is the closest thing to consumption-history data the MCP exposes — but only for THIS single account, no per-employee/per-office breakdown, and status vocabulary beyond 'received' is unconfirmed (only one sample order observed). |
| `silpo_get_my_offline_orders` | Read | NONE | branchId, deliveryType, timeslotStart, timeslotEnd | Yes | MEDIUM | In-store purchase history via loyalty card. lagerId can be used as a precise re-order key via silpo_find_products_batch. |

## Payments

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_certificates` | Read | NONE | — | Yes | LOW | Gift certificates for the individual account; not a corporate payment instrument. |

## Personalization

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_my_favorites` | Read | NONE | branchId, deliveryType, timeslotStart | Yes | MEDIUM | Could be repurposed as a proxy for a 'standard office basket' but is a single-account list, not a shared/office-level list. |
| `silpo_add_or_update_favorite_products` | **Write** | LOW | actions[].productId, actions[].externalProductId, actions[].toDelete | Yes | LOW | Max 5 actions/call. NOT executed (write). |

## Promotions

| Tool | R/W | Risk | Required inputs | Auth | B2B usefulness | Notes |
|---|---|---|---|---|---|---|
| `silpo_get_promotions` | Read | NONE | branchId, deliveryType, timeslotStart, timeslotEnd | Yes | MEDIUM | Active promo codes usable as a filter in silpo_get_products — a Budget Agent could prefer promo'd SKUs to stretch budget. |
| `silpo_get_promo_codes` | Read | NONE | — | Yes | LOW | Personal promo codes for the authenticated consumer. |
