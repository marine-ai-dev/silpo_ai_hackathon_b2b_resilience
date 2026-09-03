# 05 — B2B Capability Matrix

Classification: **NATIVE MCP** (fully provided) · **PARTIALLY SUPPORTED** (a piece exists, we must extend it) · **MUST BE BUILT BY US** (nothing exists, we own it entirely) · **NOT CURRENTLY POSSIBLE** (blocked by an MCP/platform limitation, not just unbuilt).

| # | Capability | Classification | Enabling MCP tool(s) | Notes |
|---|---|---|---|---|
| 1 | Office onboarding (register a company/office) | **NOT CURRENTLY POSSIBLE** | — | No company/tenant entity exists in the schema. We can only operate as/through one consumer account. |
| 2 | Employee profiles/preferences | **MUST BE BUILT BY US** | `silpo_get_my_food_restrictions` (pattern reference only) | The MCP models 1 account = 1 diet profile; per-employee data must live in our own store. |
| 3 | Office product catalogue | **NATIVE MCP** | `silpo_get_categories_tree`, `silpo_get_products` | Full 28-category grocery/home-goods catalog, branch-scoped. |
| 4 | Product search | **NATIVE MCP** | `silpo_find_products_batch`, `silpo_get_products` | Multi-term batch search up to 30 terms; numeric article-code search for precision. |
| 5 | Product availability | **NATIVE MCP** | `product.stock`, `available`, `silpo_get_replacements` | Stock + a picking-risk signal beyond simple stock=0. |
| 6 | Pricing | **NATIVE MCP** | `product.price`, `oldPrice`, `specialPrices` | Timeslot/branch-scoped pricing. |
| 7 | Promotions | **NATIVE MCP** | `silpo_get_promotions`, `mustHavePromotion` filter | — |
| 8 | Office favourites (shared list) | **PARTIALLY SUPPORTED** | `silpo_get_my_favorites` / `silpo_add_or_update_favorite_products` | Only one favorites list per account — cannot be "the office's" list distinct from a personal one without our own layer. |
| 9 | Standard office basket (named, reusable) | **MUST BE BUILT BY US** | (compose from #4 + our storage) | No "saved basket/template" object in the MCP. |
| 10 | Recurring basket / subscription | **NOT CURRENTLY POSSIBLE** (via MCP alone) | — | No subscription/recurring-order object found anywhere. Must be built entirely in our layer (schedule + re-run workflow K). |
| 11 | Consumption tracking | **PARTIALLY SUPPORTED** | `silpo_get_my_online_orders`, `silpo_get_my_offline_orders` | Gives raw order/receipt history for the ONE account — usable as a data source, but we must aggregate/derive "consumption" ourselves; no per-employee or per-office breakdown exists. |
| 12 | Demand forecasting | **MUST BE BUILT BY US** | (consumes #11) | Pure agent/analytics responsibility; no forecasting primitive in the MCP. |
| 13 | Automatic quantity adjustment ("not enough"/"too much") | **MUST BE BUILT BY US** | `silpo_add_or_update_cart_products` (execution only) | The MCP can execute a quantity change; deciding the new quantity is entirely ours. |
| 14 | Weekly employee meal planning | **MUST BE BUILT BY US** | `silpo_get_my_food_restrictions` (per-account reference), `silpo_get_products` | No per-employee meal-selection object exists. |
| 15 | Group ordering (aggregate many employees → one cart) | **MUST BE BUILT BY US** | `silpo_add_or_update_cart_products` (execution only) | Aggregation logic and per-employee item ownership must live in our system; the cart is a single flat product list. |
| 16 | Budget control | **PARTIALLY SUPPORTED** | `cart.calculation.total` / `totalAfterDiscounts` | The cart tells you the running total (good for a hard stop check), but there is no budget field, limit, or enforcement in the MCP itself — enforcement logic is ours. |
| 17 | Spending limits (per-employee/per-category) | **NOT CURRENTLY POSSIBLE** | — | No such object exists. |
| 18 | Manager approval | **NOT CURRENTLY POSSIBLE** | — | No approval/workflow-state object; must be built entirely outside the MCP, gating our own call to the cart-write tools. |
| 19 | Procurement policy (allowed categories/vendors/max qty) | **NOT CURRENTLY POSSIBLE** | — | No policy object; enforcement must happen in our agent layer before calling `silpo_add_or_update_cart_products`. |
| 20 | Cart construction | **NATIVE MCP** | `silpo_create_shopping_cart`, `silpo_add_or_update_cart_products` | — |
| 21 | Cart modification | **NATIVE MCP** | `silpo_add_or_update_cart_products`, `silpo_remove_cart_products`, `silpo_clear_shopping_cart` | — |
| 22 | Delivery address (office address) | **PARTIALLY SUPPORTED** | `silpo_find_address`, `silpo_get_my_delivery_addresses`, `silpo_create_shopping_cart` | Address is modeled the same as a personal address — workable for a single office, awkward for multi-office (see #34). |
| 23 | Delivery slot selection | **NATIVE MCP** | `silpo_get_time_slots`, `silpo_update_shopping_cart` | — |
| 24 | Delivery fee calculation | **NATIVE MCP** | `cart.calculation.delivery.total` | Also exposes express-delivery pricing/ETA. |
| 25 | Order creation (checkout) | **NOT CURRENTLY POSSIBLE** | — | **No tool finalizes a cart into an order.** This is the single largest gap for the whole B2B flow. |
| 26 | Order confirmation | **NOT CURRENTLY POSSIBLE** | — | Follows directly from #25. |
| 27 | Payment | **NOT CURRENTLY POSSIBLE** (execution) / **PARTIALLY SUPPORTED** (info) | `cart.calculation.payment.availableTypes[]` | The MCP can *describe* available payment types and apply certificates/bonuses toward the total, but cannot execute payment or checkout. |
| 28 | Order tracking | **PARTIALLY SUPPORTED** | `silpo_get_my_online_orders` | History/status list, not live push tracking. |
| 29 | Previous orders | **NATIVE MCP** | `silpo_get_my_online_orders`, `silpo_get_my_offline_orders` | — |
| 30 | Repeat order | **PARTIALLY SUPPORTED** | `silpo_find_products_batch` (by `lagerId`/`externalProductId`) + workflow D | No one-call "reorder", but the precise re-lookup path exists. |
| 31 | Loyalty / bonuses | **NATIVE MCP** | `silpo_get_loyalty_info`, `cart.loyalty`, `silpo_update_shopping_cart.bonusRequested` | Individual-account loyalty only, not a corporate program. |
| 32 | Coupons / promotions | **NATIVE MCP** | `silpo_get_my_coupons`, `silpo_get_coupon_details`, `silpo_get_promo_codes` | — |
| 33 | Notifications | **NOT CURRENTLY POSSIBLE** | — | No push/webhook/notification primitive of any kind observed. |
| 34 | Multi-office support | **NOT CURRENTLY POSSIBLE** | — | Single cart/single address per account; multi-office would require multiple accounts or a from-scratch abstraction on our side. |
| 35 | Multi-user / company accounts | **NOT CURRENTLY POSSIBLE** | — | No tenant/membership/role object anywhere in the 40 tool schemas. |
| 36 | Reporting / analytics | **MUST BE BUILT BY US** | (consumes #11, #29) | Only raw history is available; aggregation/reporting is entirely ours. |

## Pattern across the matrix

Everything **below the cart** (catalog, pricing, promotions, delivery logistics, bonus/certificate application) is strong and native. Everything **above the cart or beyond checkout** (company identity, employees, budgets, approvals, recurrence, order placement itself, notifications) does not exist in this MCP and must be entirely our own application layer, sitting in front of a single shared Silpo consumer/B2B-delivery-type account.
