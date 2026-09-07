// explainService — turns a completed procurement run into a short,
// human-readable rationale for the activity timeline / judge demo.
//
// Deterministic by default: quantities, budgets, dates and policy decisions
// are NEVER computed here — this only narrates numbers the agents already
// produced (see AGENTS.md: "AI" in this project means the deterministic
// Demand/Procurement/Budget&Policy agents, not an LLM call).
//
// If GEMINI_API_KEY is set, this optionally asks Gemini Flash (via the
// official @google/generative-ai SDK) to phrase the same already-computed
// facts more naturally. If the key is absent or the call fails, it falls
// back to a deterministic template — the demo never stops working and
// never fabricates a "live Gemini" result it didn't actually get.

let genAIClientPromise = null;

async function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIClientPromise) {
    genAIClientPromise = import('@google/generative-ai')
      .then(({ GoogleGenerativeAI }) => new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-flash-latest' }))
      .catch((err) => {
        console.error('[explainService] Gemini SDK unavailable:', err.message);
        return null;
      });
  }
  return genAIClientPromise;
}

function deterministicExplanation({ forecast, proposal }) {
  const lines = [];
  const items = forecast?.items || [];
  const notableAdjustments = items.filter((it) => it.delta && it.delta !== 0);
  if (notableAdjustments.length > 0) {
    lines.push(
      `Demand Agent adjusted ${notableAdjustments.length} item(s) based on recent feedback and attendance: ` +
      notableAdjustments.map((it) => `${it.label} (${it.delta > 0 ? '+' : ''}${it.delta} ${it.unit})`).join(', ') + '.'
    );
  } else {
    lines.push('Demand Agent forecast quantities from trailing consumption history, scaled to expected attendance.');
  }

  const swaps = (proposal?.history || []).filter((h) => ['enforce_category_cap', 'swap_to_promotion', 'proportional_trim', 'strip_banned_category'].includes(h.action));
  if (swaps.length > 0) {
    lines.push(`Budget & Policy Agent applied ${swaps.length} adjustment(s) to stay within budget: ` + swaps.map((s) => s.detail || s.action).join('; ') + '.');
  } else if (proposal?.budgetCheck?.withinBudget) {
    lines.push('Budget & Policy Agent confirmed the proposal fits within the weekly budget with no trimming needed.');
  }

  return lines.join(' ');
}

/**
 * Returns { text, source: 'gemini-flash' | 'deterministic' }. Never throws —
 * a Gemini failure always falls back to the deterministic explanation.
 */
export async function explainProcurementRun({ forecast, proposal }) {
  const fallback = deterministicExplanation({ forecast, proposal });
  const model = await getGeminiModel();
  if (!model) return { text: fallback, source: 'deterministic' };

  try {
    const facts = {
      items: (forecast?.items || []).map((it) => ({ product: it.label, quantity: it.forecastQty, unit: it.unit, rationale: it.rationale })),
      totalEstimated: proposal?.totalEstimated,
      weeklyBudget: proposal?.budgetCheck?.weeklyBudget,
      withinBudget: proposal?.budgetCheck?.withinBudget,
      policyActions: (proposal?.history || []).map((h) => h.detail || h.action)
    };
    const prompt = `You are summarizing an already-computed B2B office procurement decision for a judge demo. ` +
      `Do not invent numbers — only restate the facts below in 2-3 concise sentences (Ukrainian or English, match the input). ` +
      `Facts (JSON): ${JSON.stringify(facts)}`;
    const result = await model.generateContent(prompt);
    const text = result?.response?.text()?.trim();
    if (!text) return { text: fallback, source: 'deterministic' };
    return { text, source: 'gemini-flash' };
  } catch (err) {
    console.error('[explainService] Gemini call failed, using deterministic fallback:', err.message);
    return { text: fallback, source: 'deterministic' };
  }
}
