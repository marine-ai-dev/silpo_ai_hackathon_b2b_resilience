# PRODUCT.md — AI Office Procurement (Silpo B2B MVP)

## What this is

An AI-powered B2B office-supply procurement system built on top of the Silpo
grocery MCP server. An office manager gets an automatically generated,
budget-optimized weekly office-supply basket — based on past consumption,
staff feedback, expected attendance, and live Silpo prices/stock/promotions
— reviews it, approves it, and the system prepares a real Silpo shopping
cart. It never places, pays for, or cancels an order: checkout is an
explicit human handoff, because no Silpo MCP tool exists for order
placement (confirmed in `docs/silpo-mcp-audit/05-b2b-capability-matrix.md`,
row 25).

## Who it's for

Office managers / admins at small-to-mid companies who run a recurring
"stock the kitchen" purchase every week: water, coffee, tea, milk, fruit,
snacks, paper goods. Today this is manual: guess quantities, browse the
Silpo app, remember what ran out, stay under a mental budget. This system
turns that into a reviewable, explainable, one-click-to-cart workflow.

## Why agents, not a chatbot

The value here is not conversational — it's decision-making:

- **DemandAgent** does real forecasting math (trailing averages, attendance
  scaling, feedback-driven adjustment) and shows its work.
- **ProcurementAgent** does real product resolution against a live catalog
  (batched search, in-stock preference, category fallback).
- **BudgetPolicyAgent** does real constrained optimization (category caps,
  promotion swaps, proportional trimming with essential-item floors).

A chatbot wrapper around Silpo's MCP would let a human ask "what's in
stock", but it would not forecast, optimize, or enforce policy. This system
does that work automatically and explains every number it produces —
that's the "agentic" part, not an LLM chat loop.

## Why Silpo MCP

Silpo's MCP server (audited in `docs/silpo-mcp-audit/`) exposes a full,
branch/timeslot-scoped grocery catalog with real pricing, stock, and
promotions, plus a real (if B2C-shaped) cart lifecycle including a
dedicated `B2B` delivery type. That's a real commerce backend we can build
a genuine procurement product on top of — not a mock API.

## Why B2B

Office procurement is recurring, budget-constrained, and requires
sign-off — none of which exists in Silpo's consumer app. The gap between
"Silpo has a great catalog and cart" and "a company can run its weekly
office supply run through it" is exactly the product surface this MVP
fills in, sitting entirely in our own application layer in front of one
shared Silpo account (see `docs/silpo-mcp-audit/07-gaps-and-limitations.md`
section B for the full list of what Silpo does not provide).

## What's explicitly out of scope

- Order placement, payment, checkout — no Silpo MCP tool does this.
- Multi-tenant company accounts, employee auth/login.
- Notifications (email/Slack).
- Any Silpo MCP tool call beyond catalog/search/promotions/replacements/
  cart-read/cart-write (add/update/remove) and delivery-type/timeslot setup.

See `docs/b2b-mvp/PITCH_POINTS.md` for the pitch-ready version of this
narrative.
