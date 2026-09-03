# 01 — Server Capabilities

## Connection

- Server name (registered): `silpo`
- Transport: HTTP (`claude mcp add --transport http --scope project silpo https://mcp.silpo.ua/mcp`)
- Discovered tool namespace prefix in this session: `mcp__125dfa4b-76e1-4cf1-9dce-8d022c8e43dc__silpo_*`
- Authentication: the connection is already authenticated server-side to **one specific Сільпо consumer loyalty account** (verified live via `silpo_get_my_profile` → Марина Антоневич, profile id `9c3870bd-ef03-439c-93c8-39e941a3e04e`). No OAuth/login tool is exposed to the MCP client — auth is handled outside the tool surface (bearer/session tied to the connector registration).

## MCP primitives exposed

| Primitive | Status |
|---|---|
| Tools | **40 tools discovered** (see [02-tools-inventory.md](02-tools-inventory.md) and `tool-inventory.json`) |
| Resources | Not exposed by this MCP server. |
| Resource templates | Not exposed by this MCP server. |
| Prompts | Not exposed by this MCP server. |
| Prompt arguments | Not exposed by this MCP server (no prompts exist). |
| Server-level instructions/metadata document | Not exposed as a separate primitive. Operational guidance instead lives **inside individual tool descriptions** (e.g. "call X immediately after Y", "never add plastic bags to cart", "always show totalAfterDiscounts not total"). This is a documented pattern in this MCP, not a separate discoverable capability. |

## Authentication-related characteristics visible to the client

- No explicit `login`/`authenticate`/`whoami`-style tool distinct from `silpo_get_my_profile`.
- Every tool implicitly operates against the single authenticated account — there is no `userId`/`accountId` parameter on any tool, confirming the server, not the client, scopes identity.
- No tool accepts or returns an API key, token, or company/tenant identifier.
- No evidence of a company/organization/tenant concept anywhere in the 39 schemas (see [03-domain-model.md](03-domain-model.md)).

## Supported entities / domain objects

See [03-domain-model.md](03-domain-model.md) for the full graph. At a glance, objects with schema evidence: profile, family member, loyalty card/balance, food restriction, premium subscription, delivery address, branch (store), delivery type, time slot, category, product/SKU, product set, promotion, promo code, coupon, gift certificate, favorite, shopping cart, cart shipment, cart product line, cart calculation/validation, online order, offline order (receipt).

## Pagination, filtering, search, sorting

- **Pagination**: `limit`/`offset` present on `silpo_list_branches`, `silpo_get_categories`, `silpo_get_products`, `silpo_find_products_batch` (per-query `limit` only, no offset), `silpo_get_my_favorites`, `silpo_get_similar_products`, `silpo_get_my_certificates`, `silpo_get_my_online_orders`, `silpo_get_my_offline_orders` (max 10), `silpo_get_time_slots`.
- **Filtering**: `silpo_get_products` supports `category`, `mustHavePromotion`, `promotionCode`, `set`, `fromPrice`, `toPrice`, `inStock`; `silpo_list_branches` supports `hasPickup`, `hasNP`.
- **Search**: `silpo_find_products_batch` (multi-term, up to 30 terms per call, accepts free text or exact numeric article code).
- **Sorting**: `silpo_get_products.sortBy` ∈ {popularity, score, title, price, promotion, productsList, slugsList, guestRating, carouselList}, `sortDirection` ∈ {asc, desc}.

## Cross-operation identifiers (the "join keys" of this MCP)

| Identifier | Produced by | Consumed by |
|---|---|---|
| `branchId` | `silpo_get_shopping_cart_by_id`, `silpo_list_branches`, `silpo_get_available_delivery_types` | almost every catalog/cart/delivery tool |
| `deliveryType` | `silpo_get_shopping_cart_by_id`, `silpo_get_available_delivery_types` | catalog + cart + timeslot tools |
| `timeslotStart`/`timeslotEnd` | `silpo_get_shopping_cart_by_id`, `silpo_get_time_slots` | catalog browse/search tools (price/availability is timeslot-sensitive) |
| `shoppingCartId` | `silpo_get_my_shopping_cart`, `silpo_create_shopping_cart` | all cart-mutation and cart-read tools |
| `productId` + `companyId` + `branchId` | any product-returning tool | `silpo_add_or_update_cart_products`, `silpo_remove_cart_products`, favorites |
| `slug` | search/list results | `silpo_get_product_details`, `silpo_get_similar_products`, `silpo_get_category` |
| `externalProductId` | search/order/receipt results | `silpo_find_products_batch` numeric search, `silpo_add_or_update_favorite_products` |
| `promoId` | `silpo_get_my_coupons`/`silpo_get_my_promos` | joins to `rewards[].promoId` in `silpo_get_my_offline_orders` |

## Prerequisites / apparent constraints observed in schemas

1. Cart-scoped catalog tools (`silpo_get_products`, `silpo_find_products_batch`, `silpo_get_categories_tree`, `silpo_get_promotions`, `silpo_get_product_details`, `silpo_get_similar_products`, `silpo_get_my_favorites`) require `branchId` + `deliveryType` + a `timeslotStart`/`timeslotEnd` window — pricing/availability is timeslot-dependent, not global.
2. The recommended bootstrap order (per tool descriptions) is: `silpo_get_my_shopping_cart` → (if `exists=false`) `silpo_find_address` → `silpo_get_available_delivery_types` → (`silpo_list_branches` if branch unresolved) → `silpo_get_time_slots` → `silpo_create_shopping_cart` → `silpo_get_shopping_cart_by_id`.
3. `silpo_add_or_update_cart_products` does **not** validate stock itself — the tool description mandates an immediate follow-up call to `silpo_get_shopping_cart_by_id` to check `calculation.validations[]` for stock/budget errors. This "write-then-mandatory-reread" pattern repeats across every cart-mutating tool.
4. `silpo_get_my_offline_orders` is capped at `limit ≤ 10` — no way to bulk export purchase history in one call.
5. `silpo_find_products_batch` caps at 30 search terms per call.

## Read-only vs state-changing (summary; full detail in Phase 2)

- **33 read-only tools** (get/list/find/search semantics).
- **7 state-changing tools**: `silpo_create_shopping_cart`, `silpo_add_or_update_cart_products`, `silpo_remove_cart_products`, `silpo_clear_shopping_cart`, `silpo_update_shopping_cart`, `silpo_add_or_update_certificates`, `silpo_add_or_update_favorite_products`.

## Financial / transactional side effects

No tool places an order, charges a payment method, or confirms checkout — **no explicit "place order" / "checkout" / "pay" tool was found in this MCP's tool list at all.** The state-changing tools found only build/modify a pre-checkout cart (add/remove products, set delivery, apply a promo code, request bonus-points payment, apply/remove a gift certificate, clear cart) and modify favorites. This is a significant scope boundary — see [07-gaps-and-limitations.md](07-gaps-and-limitations.md).

`silpo_update_shopping_cart.bonusRequested` and `silpo_add_or_update_certificates` do have a **financial side effect on the cart total** (they allocate loyalty bonuses / certificate value against the draft order) even though they don't finalize a purchase.
