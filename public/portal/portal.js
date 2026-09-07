// Demo Office Portal — single seeded customer (DreamGift Atelier). Talks
// ONLY to our own application API (normal GET/POST/PUT), never to Silpo
// MCP directly — the backend is the only MCP client (see
// docs/hackathon/ARCHITECTURE_DIAGRAM.md). Deliberately no auth/multi-
// tenancy: this is a hackathon demo portal, not a SaaS.

const OFFICE_ID = 'office-dreamgift-atelier';
const api = (path, opts) => fetch(`/api${path}`, {
  headers: { 'Content-Type': 'application/json' },
  ...opts
}).then(async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
});

const $ = (sel) => document.querySelector(sel);

async function loadMeta() {
  try {
    const { mode } = await api('/meta/silpo-mode');
    $('#silpoModeBadge').textContent = `Silpo MCP: ${mode === 'live' ? 'LIVE' : 'MOCK'}`;
    $('#silpoModeBadge').classList.add(mode === 'live' ? 'ok' : 'warn');
  } catch { $('#silpoModeBadge').textContent = 'Silpo MCP: н/д'; }
  try {
    const { available } = await api('/meta/gemini-status');
    $('#geminiBadge').textContent = `Gemini: ${available ? 'увімкнено' : 'fallback (deterministic)'}`;
  } catch { $('#geminiBadge').textContent = 'Gemini: fallback'; }
}

async function loadProfile() {
  const office = await api(`/offices/${OFFICE_ID}`);
  const budget = await api(`/offices/${OFFICE_ID}/budget`);
  $('#officeAddress').value = office.address?.text || '';
  $('#expectedAttendance').value = office.memberCount;
  $('#weeklyBudget').value = budget?.weeklyBudgetUAH ?? '';
}

async function saveProfile() {
  const status = $('#saveProfileStatus');
  status.textContent = 'Збереження…';
  try {
    await api(`/offices/${OFFICE_ID}`, { method: 'PUT', body: JSON.stringify({ memberCount: Number($('#expectedAttendance').value) }) });
    await api(`/offices/${OFFICE_ID}/budget`, { method: 'PUT', body: JSON.stringify({ weeklyBudgetUAH: Number($('#weeklyBudget').value) }) });
    status.textContent = 'Збережено ✓';
    setTimeout(() => { status.textContent = ''; }, 2500);
  } catch (err) {
    status.textContent = `Помилка: ${err.message}`;
  }
}

async function loadReadiness() {
  const items = await api(`/offices/${OFFICE_ID}/readiness-items`);
  const el = $('#readinessList');
  el.innerHTML = items.map((it) => {
    const gap = it.shortfall?.shortfall ?? 0;
    const current = it.shortfall?.mostRecentKnownQuantity ?? '?';
    return `<div class="readiness-row">
      <span>${escapeHtml(it.label)}</span>
      <span>${current} / ${it.targetQuantity} ${escapeHtml(it.unit)} — ${gap > 0 ? `<span class="gap">брак ${gap}</span>` : '<span class="ok">норма</span>'}</span>
    </div>`;
  }).join('') || '<div class="hint">Немає даних</div>';
}

async function loadPower() {
  const schedule = await api(`/offices/${OFFICE_ID}/power-schedule`);
  const el = $('#powerStatus');
  const window = schedule.nextOutage ? `${new Date(schedule.nextOutage.start).toLocaleString('uk-UA')} — ${new Date(schedule.nextOutage.end).toLocaleString('uk-UA')}` : 'не задано';
  el.innerHTML = `
    <div><b>Джерело:</b> ${provenanceBadge(schedule.source)}</div>
    <div><b>Статус:</b> ${escapeHtml(schedule.currentStatus)}</div>
    <div><b>Наступне вікно:</b> ${window}</div>
    <div class="hint">${escapeHtml(schedule.sourceNote || '')}</div>`;
}

async function loadFeedback() {
  const feedback = await api(`/offices/${OFFICE_ID}/feedback`);
  const el = $('#feedbackList');
  const recent = feedback.slice(-5).reverse();
  el.innerHTML = recent.map((f) => `<div class="feedback-row"><span>${escapeHtml(f.productKey)} — ${signalLabel(f.signal)}</span><span class="hint">${escapeHtml(f.weekOf)}</span></div>`).join('') || '<div class="hint">Немає відгуків</div>';
}

function signalLabel(s) {
  return { NOT_ENOUGH: 'не вистачало', JUST_RIGHT: 'достатньо', TOO_MUCH: 'забагато' }[s] || s;
}

function provenanceBadge(source) {
  const map = {
    LIVE_MCP: 'LIVE (Silpo MCP)', MOCK: 'MOCK', MANUAL: 'MANUAL', DEMO: 'DEMO', UNAVAILABLE: 'UNAVAILABLE',
    'silpo-mcp-live': 'LIVE (Silpo MCP)', 'silpo-mcp-mock': 'MOCK (Silpo MCP)', unavailable: 'UNAVAILABLE'
  };
  return `<span class="badge">${map[source] || String(source || 'н/д').toUpperCase()}</span>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function submitFeedback(ev) {
  ev.preventDefault();
  await api(`/offices/${OFFICE_ID}/feedback`, {
    method: 'POST',
    body: JSON.stringify({
      weekOf: new Date().toISOString().slice(0, 10),
      productKey: $('#fbProduct').value,
      signal: $('#fbSignal').value,
      note: $('#fbNote').value
    })
  });
  $('#fbNote').value = '';
  await loadFeedback();
}

// ---- Run AI Procurement Plan: the main interactive demo flow ----

const TIMELINE_STEPS = [
  { key: 'demand', icon: '🟣', who: 'Demand Agent', what: 'аналізує споживання + явку + відгуки' },
  { key: 'procurement', icon: '🟣', who: 'Procurement Agent', what: 'шукає товари через офіційний Silpo MCP' },
  { key: 'budget', icon: '🟣', who: 'Budget & Policy Agent', what: 'оптимізує пропозицію під бюджет' },
  { key: 'resilience', icon: '🔵', who: 'Resilience Planner', what: 'враховує графік живлення та готовність' },
  { key: 'human', icon: '⚪', who: 'Human', what: 'потрібне затвердження менеджером' }
];

function renderTimelineSkeleton() {
  const el = $('#timeline');
  el.hidden = false;
  el.innerHTML = TIMELINE_STEPS.map((s) => `<div class="timeline-step pending" data-key="${s.key}"><span class="icon">${s.icon}</span><div><div class="who">${s.who}</div><div class="what">${s.what}</div></div></div>`).join('');
}

function markStepDone(key, resultText) {
  const stepEl = document.querySelector(`.timeline-step[data-key="${key}"]`);
  if (!stepEl) return;
  stepEl.classList.remove('pending');
  if (resultText) stepEl.querySelector('.what').textContent = resultText;
}

async function runPlan() {
  const btn = $('#runPlanBtn');
  btn.disabled = true;
  const resultEl = $('#runResult');
  resultEl.hidden = true;
  renderTimelineSkeleton();

  try {
    const weekOf = new Date().toISOString().slice(0, 10);
    const expectedAttendance = Number($('#expectedAttendance').value);

    markStepDone('demand');
    const runResp = await api(`/offices/${OFFICE_ID}/procurement-runs`, {
      method: 'POST',
      body: JSON.stringify({ weekOf, expectedAttendance })
    });
    const { run, forecast, proposal } = runResp;
    markStepDone('demand', `сформовано прогноз на ${forecast.items?.length ?? 0} позицій`);
    markStepDone('procurement', `знайдено ${proposal.items?.length ?? 0} товар(и) через Silpo MCP (${proposal.sourceMode === 'live' ? 'LIVE' : 'MOCK'})`);
    markStepDone('budget', proposal.budgetCheck?.withinBudget ? `вкладається в бюджет ₴${proposal.budgetCheck.weeklyBudget}` : 'бюджет перевищено — застосовано корекції');

    const resiliencePlan = await api(`/offices/${OFFICE_ID}/resilience-plan`).catch(() => null);
    if (resiliencePlan) {
      markStepDone('resilience', `ризик: ${resiliencePlan.risk?.level || 'н/д'}`);
    } else {
      markStepDone('resilience', 'план стійкості недоступний');
    }
    markStepDone('human', 'очікує затвердження менеджера ↓');

    let explanation = null;
    try { explanation = await api(`/procurement-runs/${run.id}/explain`); } catch { /* optional */ }

    renderResult({ run, forecast, proposal, resiliencePlan, explanation });
  } catch (err) {
    $('#timeline').innerHTML += `<div class="timeline-step">⚠️ Помилка: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderResult({ run, forecast, proposal, resiliencePlan, explanation }) {
  const el = $('#runResult');
  el.hidden = false;

  const itemsRows = (proposal.items || []).map((it) => `<tr>
    <td>${escapeHtml(it.productName || it.label)}</td>
    <td>${it.quantity} ${escapeHtml(it.unit || '')}</td>
    <td>${it.unitPrice != null ? `₴${it.unitPrice}` : '—'}</td>
    <td>${it.lineTotal != null ? `₴${it.lineTotal}` : '—'}</td>
  </tr>`).join('');

  const logisticsLabel = resiliencePlan?.logistics
    ? (resiliencePlan.logistics.available ? (resiliencePlan.logistics.branchSelection?.usedFailover ? 'generator-branch reroute' : 'normal branch') : 'unavailable')
    : null;
  const resilienceHtml = resiliencePlan ? `
    <div>
      <div class="section-title">Стійкість / логістика</div>
      <div>Ризик: <b>${escapeHtml(resiliencePlan.risk?.level || 'н/д')}</b> — ${escapeHtml(resiliencePlan.recommendation?.summary || '')}</div>
      <div class="provenance-row">${provenanceBadge(resiliencePlan.situation?.power?.source)} <span class="badge">Logistics: ${escapeHtml(logisticsLabel || 'н/д')}</span></div>
    </div>` : '';

  el.innerHTML = `
    <div>
      <div class="section-title">Пояснення (${explanation?.source === 'gemini-flash' ? 'Gemini Flash' : 'deterministic'})</div>
      <p>${escapeHtml(explanation?.text || 'Пояснення недоступне.')}</p>
    </div>
    <div>
      <div class="section-title">Пропозиція закупівлі</div>
      <table class="item-table"><thead><tr><th>Товар</th><th>К-сть</th><th>Ціна</th><th>Сума</th></tr></thead><tbody>${itemsRows}</tbody></table>
      <div class="provenance-row">${provenanceBadge(proposal.sourceMode === 'live' ? 'LIVE_MCP' : 'MOCK')} <span class="badge">Всього: ₴${proposal.totalEstimated ?? '?'}</span></div>
    </div>
    ${resilienceHtml}
    <div class="approve-row">
      <button id="approveBtn" class="btn primary">✅ Затвердити план</button>
      <span id="approveStatus" class="hint"></span>
    </div>
  `;

  $('#approveBtn').addEventListener('click', () => approveAndPrepare(proposal.id));
}

async function approveAndPrepare(proposalId) {
  const status = $('#approveStatus');
  status.textContent = 'Затвердження…';
  try {
    await api(`/proposals/${proposalId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ approverName: 'Демо-менеджер (DreamGift Atelier)', decision: 'approved', comment: 'Затверджено через Demo Office Portal' })
    });
    status.textContent = 'Затверджено. Готуємо кошик (без оформлення замовлення)…';
    const cartSync = await api(`/proposals/${proposalId}/prepare-cart`, { method: 'POST' });
    const itemCount = cartSync.cartSnapshot?.products?.length ?? '?';
    status.textContent = cartSync.status === 'prepared'
      ? `Кошик підготовлено ✓ (${itemCount} позицій, Silpo cart ${cartSync.silpoCartId || ''}). Оформлення замовлення — лише вручну людиною, поза застосунком.`
      : `Кошик підготовлено з попередженнями: ${cartSync.errorDetail || ''}`;
  } catch (err) {
    status.textContent = `Помилка: ${err.message}`;
  }
}

async function init() {
  await Promise.all([loadMeta(), loadProfile(), loadReadiness(), loadPower(), loadFeedback()]);
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#feedbackForm').addEventListener('submit', submitFeedback);
  $('#runPlanBtn').addEventListener('click', runPlan);
}

init();
