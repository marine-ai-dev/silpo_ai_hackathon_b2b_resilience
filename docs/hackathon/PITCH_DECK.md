# PITCH_DECK.md — 9-slide structure

Presentation-friendly outline, not documentation. Each slide: title, one
key message, 3–5 bullets max, a suggested visual, a short speaker note.

---

### Slide 1 — Problem

**Key message:** Ukrainian offices run recurring procurement on top of an operational reality most tools ignore: routine power interruptions.

- Water/coffee/supplies restocking is already a weekly chore
- Power interruptions add a second layer of risk: missing stock, bad delivery timing
- Manual tracking of "do we have enough batteries right now" doesn't scale
- Existing procurement tools have no concept of "prepare before the outage"

**Visual:** a split image — a normal office supply order vs. the same order with a power-outage countdown overlay.

**Speaker note:** Land this as an operational-planning problem, not a disaster narrative. Keep it grounded and practical.

---

### Slide 2 — Why now

**Key message:** This isn't hypothetical — it's a standing operational condition for Ukrainian businesses today.

- Scheduled and unscheduled outages are a routine planning input, not an edge case
- Businesses already track this manually (DTEK site, Telegram bots, spreadsheets)
- Silpo itself already runs generators at 100+ branches nationwide — the infrastructure to route around outages already exists, just not connected to procurement
- Silpo already runs a real battery-recycling program — an existing lifecycle waiting to be closed

**Visual:** map pin cluster of Silpo generator-backed branches (real data, from `silpo.ua/de-pracyuiemo-na-generatorax`).

**Speaker note:** This slide's job is credibility — show the underlying pieces (generators, recycling) already exist at Silpo; we're the layer that connects them to a business's procurement workflow.

---

### Slide 3 — Solution

**Key message:** An AI procurement and resilience layer on top of the real Silpo MCP server.

- Weekly office restock: forecast → real Silpo products → budget-optimized → approved → real cart
- Resilience layer: power status → risk → emergency stock gap → timing → branch recommendation
- One human approval gate before anything touches a real Silpo cart — always
- A closed battery lifecycle: buy → use → collect → recycle

**Visual:** the one-workflow diagram from `ARCHITECTURE_DIAGRAM.md`.

**Speaker note:** Say "layer on top of Silpo MCP," not "app that talks to Silpo" — frame it as infrastructure, not a bolt-on.

---

### Slide 4 — How the agents work

**Key message:** Three deterministic agents do real decision-making — this is not a chatbot wrapper.

- **Demand Agent** — trailing-average forecast + attendance scaling + feedback adjustment
- **Procurement Agent** — resolves demand to real Silpo products via live catalog search
- **Budget & Policy Agent** — promo-swapping, category caps, proportional trimming to fit budget
- All three are reused unchanged for both the weekly restock AND the emergency-readiness top-up — no duplicate agents
- The Resilience Planner composing everything is a deterministic service, not a 4th agent

**Visual:** the three-agent pipeline arrow diagram (Demand → Procurement → Budget & Policy).

**Speaker note:** Emphasize "deterministic, explainable" — every number the agents produce has a visible reason, not a black-box LLM sentence.

---

### Slide 5 — Why Silpo MCP matters

**Key message:** Every product, price, and delivery decision is resolved through Silpo's real MCP server, not invented.

- 40-tool audit of the real Silpo MCP server before building anything (`docs/silpo-mcp-audit/`)
- Real product search, real prices, real stock/promotion data
- Real delivery-branch and timeslot resolution
- App-owned OAuth 2.1 + PKCE — independent of any dev-tool session, genuinely re-verified live

**Visual:** a real captured product-search response (batteries at ₴119, ₴199, LED at ₴58.99 — from `LIVE_MCP_VERIFICATION.md`).

**Speaker note:** This is the credibility slide for the hackathon's own MCP requirement — be ready to show the raw live-call evidence doc if asked.

---

### Slide 6 — Blackout resilience demo

**Key message:** One screen turns "power situation" into "what to buy, when, and from where."

- Power status (honestly labeled MANUAL/DEMO/STALE/UNAVAILABLE — never a fake LIVE)
- Deterministic risk level (NORMAL → WATCH → PREPARE → HIGH → ACTIVE_BLACKOUT) with visible reasoning
- Emergency-stock coverage % and categories below target
- Procurement lead time + delivery-window shift, computed from the actual outage window
- Branch resilience: confidence-matched generator-branch rerouting, or an honest "no confirmed match"

**Visual:** live screenshot of the Resilience tab's Impact Summary + Power Status cards.

**Speaker note:** This is the demo slide — narrate live rather than reading bullets.

---

### Slide 7 — ESG / recycling loop

**Key message:** The emergency-stock story doesn't end at purchase — it closes the loop.

- Batteries bought for readiness eventually get used
- Manager logs a real recycling drop-off through Silpo's actual «Батарейки, здавайтеся!» program
- ESG card shows real counts: total recycled, drop-off history — no fabricated CO2 figures
- Buy → use → collect → recycle, visible as one continuous story, not a bolted-on feature

**Visual:** the ESG card (batteries recycled total + drop-off log).

**Speaker note:** Explicitly say "no invented CO2 numbers" — judges notice when a team is honest about what it didn't fabricate.

---

### Slide 8 — Architecture & provenance

**Key message:** Every piece of data is labeled by where it actually came from.

- AI/agentic reasoning (Demand/Procurement/Budget & Policy) vs. deterministic rules (risk model, timing math) vs. Silpo MCP data vs. manual/demo datasets — visually distinct, never blurred
- Provenance table on every plan: source, confidence, staleness, timestamp
- Cart writes gated in code, not convention — `cartPreparationService` is the only path, and only post-approval
- No checkout/payment tool exists in the audited Silpo MCP, so none was built or faked

**Visual:** `ARCHITECTURE_DIAGRAM.md`'s full flow diagram.

**Speaker note:** This slide answers "how do we know you're not just demoing a mockup" — point to the provenance table as the mechanism, not just a claim.

---

### Slide 9 — Business + societal value / conclusion

**Key message:** Real infrastructure for a real, ongoing operational problem — built honestly.

- Prepares stock and adjusts delivery timing *before* a known interruption, not after
- Keeps a human in control of every real purchase — no autonomous checkout
- Closes a real circular-economy loop through Silpo's existing recycling program
- No invented statistics — every claim in this deck traces to a running feature or a documented, cited limitation

**Visual:** the "problem → solution → what's real" one-liner from `HACKATHON_NARRATIVE.md`.

**Speaker note:** Close on honesty as a feature, not a caveat — it's the throughline of the whole project, and it's a differentiator against teams that overclaim.
