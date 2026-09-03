// Vanilla JS dashboard controller — no framework, no build step.
const state = {
  officeId: null,
  office: null,
  supplyPlan: null,
  budget: null,
  policy: null,
  currentRun: null,
  currentForecast: null,
  currentProposal: null,
  currentCartSync: null,
  theme: null
};

const ACCENT_PRESETS = ['#7c5cff', '#10b981', '#8b5cf6', '#f59e0b', '#fb7185', '#14b8a6'];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function api(path, opts) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${path}`);
  return body;
}

function fmtUAH(n) {
  return (n ?? 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' грн';
}

function badge(text, color) {
  return `<span class="badge ${color}">${text}</span>`;
}

// ---- Tabs ----
$$('nav.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('nav.tabs button').forEach((b) => b.classList.remove('active'));
    $$('section.screen').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    $(`#screen-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---- Silpo connection indicator ----
async function refreshSilpoStatus() {
  try {
    const status = await api('/silpo/status');
    const dot = $('#silpoStatusDot');
    const text = $('#silpoStatusText');
    const connectBtn = $('#silpoConnectBtn');
    const disconnectBtn = $('#silpoDisconnectBtn');
    if (status.connected) {
      dot.textContent = '●';
      dot.classList.add('connected');
      text.textContent = 'Connected';
      connectBtn.hidden = true;
      disconnectBtn.hidden = false;
    } else {
      dot.textContent = '○';
      dot.classList.remove('connected');
      text.textContent = 'Not connected';
      connectBtn.hidden = false;
      disconnectBtn.hidden = true;
    }
    return status;
  } catch (err) {
    console.error('Failed to fetch Silpo status', err);
  }
}

function showSilpoToast(message, kind = 'info') {
  const el = $('#silpoToast');
  el.textContent = message;
  el.className = `silpo-toast ${kind}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 5000);
}

function handleSilpoRedirectFlag() {
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('silpo');
  if (!flag) return;
  if (flag === 'connected') {
    showSilpoToast('Silpo connected successfully.', 'success');
  } else if (flag === 'error') {
    showSilpoToast(`Silpo connection failed (${params.get('reason') || 'unknown error'}).`, 'error');
  }
  params.delete('silpo');
  params.delete('reason');
  const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
  window.history.replaceState({}, '', clean);
}

$('#silpoConnectBtn').addEventListener('click', () => {
  window.location.href = '/api/silpo/connect';
});
$('#silpoDisconnectBtn').addEventListener('click', async () => {
  await api('/silpo/disconnect', { method: 'POST' });
  await refreshSilpoStatus();
});

// ---- Theming ----
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return '124, 92, 255';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

function initials(name) {
  if (!name) return 'MA';
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}

function applyTheme(theme) {
  if (!theme) return;
  state.theme = theme;
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.accentColor || '#7c5cff');
  root.style.setProperty('--accent-2', theme.accentColorSecondary || '#22d3ee');
  root.style.setProperty('--accent-rgb', hexToRgb(theme.accentColor));
  root.style.setProperty('--accent-2-rgb', hexToRgb(theme.accentColorSecondary));

  const name = theme.companyName || 'MarineAI';
  $('#brandName').textContent = name;
  const logoEls = [$('#brandLogo'), $('#previewLogo')].filter(Boolean);
  for (const el of logoEls) {
    if (theme.logoUrl) {
      el.innerHTML = `<img src="${theme.logoUrl}" alt="${name} logo" />`;
    } else {
      el.textContent = initials(name);
    }
  }
  if ($('#previewName')) $('#previewName').textContent = name;
}

function renderAccentSwatches() {
  const build = (containerId, inputId, hexId, key) => {
    const container = $(`#${containerId}`);
    if (!container) return;
    container.innerHTML = ACCENT_PRESETS.map((c) => `<span class="swatch" data-color="${c}" style="background:${c}"></span>`).join('');
    $$(`#${containerId} .swatch`).forEach((sw) => {
      sw.addEventListener('click', () => {
        const color = sw.dataset.color;
        $(`#${inputId}`).value = color;
        $(`#${hexId}`).textContent = color;
        $$(`#${containerId} .swatch`).forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
        previewThemeFromForm();
      });
    });
  };
  build('accentSwatches', 'themeAccent', 'themeAccentHex', 'accentColor');
  build('accent2Swatches', 'themeAccent2', 'themeAccent2Hex', 'accentColorSecondary');
}

function previewThemeFromForm() {
  applyTheme({
    companyName: $('#themeCompanyName').value,
    logoUrl: $('#themeLogoUrl').value,
    accentColor: $('#themeAccent').value,
    accentColorSecondary: $('#themeAccent2').value
  });
}

function renderThemeForm() {
  const t = state.theme || {};
  $('#themeCompanyName').value = t.companyName || 'MarineAI';
  $('#themeLogoUrl').value = t.logoUrl || '';
  $('#themeAccent').value = t.accentColor || '#7c5cff';
  $('#themeAccentHex').textContent = t.accentColor || '#7c5cff';
  $('#themeAccent2').value = t.accentColorSecondary || '#22d3ee';
  $('#themeAccent2Hex').textContent = t.accentColorSecondary || '#22d3ee';
  renderAccentSwatches();
}

['themeCompanyName', 'themeLogoUrl', 'themeAccent', 'themeAccent2'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    if (id === 'themeAccent') $('#themeAccentHex').textContent = el.value;
    if (id === 'themeAccent2') $('#themeAccent2Hex').textContent = el.value;
    previewThemeFromForm();
  });
});

const saveThemeBtnEl = document.getElementById('saveThemeBtn');
if (saveThemeBtnEl) {
  saveThemeBtnEl.addEventListener('click', async () => {
    const status = $('#themeSaveStatus');
    status.textContent = 'Saving…';
    try {
      const payload = {
        companyName: $('#themeCompanyName').value || 'MarineAI',
        logoUrl: $('#themeLogoUrl').value || '',
        accentColor: $('#themeAccent').value,
        accentColorSecondary: $('#themeAccent2').value
      };
      const saved = await api('/company-theme', { method: 'PUT', body: JSON.stringify(payload) });
      applyTheme(saved);
      status.textContent = 'Saved ✓';
      setTimeout(() => { status.textContent = ''; }, 3000);
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    }
  });
}

// ---- Accessibility mode (high-contrast / large-text) ----
const A11Y_STORAGE_KEY = 'a11yHighContrast';

function applyA11yMode(enabled) {
  const root = document.documentElement;
  const btn = $('#a11yToggle');
  if (enabled) {
    root.setAttribute('data-a11y', 'high-contrast');
  } else {
    root.removeAttribute('data-a11y');
  }
  if (btn) btn.setAttribute('aria-pressed', String(enabled));
}

function initA11yMode() {
  let enabled = false;
  try {
    enabled = localStorage.getItem(A11Y_STORAGE_KEY) === '1';
  } catch (err) {
    console.warn('localStorage unavailable, accessibility preference will not persist', err);
  }
  applyA11yMode(enabled);
}

const a11yToggleEl = document.getElementById('a11yToggle');
if (a11yToggleEl) {
  a11yToggleEl.addEventListener('click', () => {
    const nowEnabled = a11yToggleEl.getAttribute('aria-pressed') !== 'true';
    applyA11yMode(nowEnabled);
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, nowEnabled ? '1' : '0');
    } catch (err) {
      console.warn('Could not persist accessibility preference', err);
    }
  });
}

initA11yMode();

// ---- Boot ----
async function boot() {
  try {
    state.theme = await api('/company-theme');
    applyTheme(state.theme);
    renderThemeForm();
  } catch (err) {
    console.error('Failed to load company theme', err);
  }

  const meta = await api('/meta/silpo-mode');
  $('#modeBadge').textContent = `SILPO_MODE=${meta.mode}`;

  handleSilpoRedirectFlag();
  await refreshSilpoStatus();

  const offices = await api('/offices');
  state.office = offices[0];
  state.officeId = state.office.id;

  state.supplyPlan = await api(`/offices/${state.officeId}/supply-plan`);
  state.budget = await api(`/offices/${state.officeId}/budget`);
  state.policy = await api(`/offices/${state.officeId}/policy`);

  renderOfficeSetup();
  renderSupplyPlan();
  await renderFeedback();
  await renderDashboard();
  await renderHistory();
  await rehydrateCurrentRun();
  await renderReadiness();
  await renderBlackoutStatus();
  await renderRecyclingLog();
  await populateResilienceOfficeSelect();
  await renderResilience();

  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  $('#weekOfInput').value = nextMonday.toISOString().slice(0, 10);
}

// ---- Office Setup ----
function renderOfficeSetup() {
  const o = state.office;
  $('#officeSetup').innerHTML = `
    <div class="two-col">
      <div>
        <h3>Office</h3>
        <p><strong>${o.name}</strong><br/>${o.address?.text || ''}</p>
        <p>Member count (baseline): <strong>${o.memberCount}</strong></p>
      </div>
      <div>
        <h3>Budget & Policy</h3>
        <p>Weekly budget: <strong>${fmtUAH(state.budget.weeklyBudgetUAH)}</strong></p>
        <p>Category caps: ${Object.entries(state.policy.maxPerCategoryUAH || {}).map(([k, v]) => `${k}: ${fmtUAH(v)}`).join(', ') || '—'}</p>
        <p>Prefer promotions: ${state.policy.preferPromotions ? 'yes' : 'no'}</p>
        <p>Banned categories: ${(state.policy.bannedCategorySlugs || []).join(', ') || 'none'}</p>
      </div>
    </div>
  `;
}

// ---- Recurring Supplies ----
function renderSupplyPlan() {
  const tbody = $('#supplyPlanTable tbody');
  tbody.innerHTML = state.supplyPlan.items.map((it) => `
    <tr><td>${it.label}</td><td>${it.category}</td><td>${it.unit}</td><td>${it.targetProductQuery}</td></tr>
  `).join('');

  const select = $('#fbProductKey');
  select.innerHTML = state.supplyPlan.items.map((it) => `<option value="${it.productKey}">${it.label}</option>`).join('');
}

async function renderFeedback() {
  const feedback = await api(`/offices/${state.officeId}/feedback`);
  const tbody = $('#feedbackTable tbody');
  tbody.innerHTML = feedback
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))
    .map((f) => `<tr><td>${f.weekOf}</td><td>${f.productKey}</td><td>${signalBadge(f.signal)}</td><td>${f.note || ''}</td></tr>`)
    .join('');
}

function signalBadge(signal) {
  if (signal === 'NOT_ENOUGH') return badge('NOT_ENOUGH', 'amber');
  if (signal === 'TOO_MUCH') return badge('TOO_MUCH', 'red');
  return badge('JUST_RIGHT', 'green');
}

$('#submitFeedback').addEventListener('click', async () => {
  const productKey = $('#fbProductKey').value;
  const signal = $('#fbSignal').value;
  const note = $('#fbNote').value;
  const weekOf = new Date().toISOString().slice(0, 10);
  await api(`/offices/${state.officeId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ weekOf, productKey, signal, note })
  });
  $('#fbNote').value = '';
  await renderFeedback();
});

// ---- Weekly Run pipeline ----
$('#runPipelineBtn').addEventListener('click', async () => {
  const weekOf = $('#weekOfInput').value;
  const expectedAttendance = Number($('#attendanceInput').value);
  $('#runStatus').textContent = 'Running Demand → Procurement → Budget pipeline...';
  markSteps('FORECASTING');
  try {
    const result = await api(`/offices/${state.officeId}/procurement-runs`, {
      method: 'POST',
      body: JSON.stringify({ weekOf, expectedAttendance })
    });
    state.currentRun = result.run;
    state.currentForecast = result.forecast;
    state.currentProposal = result.proposal;
    markSteps(result.run.status);
    $('#runStatus').innerHTML = `Run <code class="small">${result.run.id}</code> reached status ${badge(result.run.status, 'blue')}.`;
    renderForecast();
    renderProposal();
    renderBudget();
    renderApproval();
    resetCartScreen();
    await renderDashboard();
    await renderHistory();
  } catch (err) {
    $('#runStatus').innerHTML = `<span class="badge red">FAILED</span> ${err.message}`;
  }
});

function markSteps(status) {
  const order = ['DRAFT', 'FORECASTING', 'SOURCING', 'OPTIMIZING', 'READY_FOR_APPROVAL', 'APPROVED', 'CART_PREPARED'];
  const idx = order.indexOf(status);
  $$('#runSteps span').forEach((el, i) => {
    el.classList.remove('done', 'current');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('current');
  });
}

// ---- Forecast ----
function renderForecast() {
  const tbody = $('#forecastTable tbody');
  tbody.innerHTML = state.currentForecast.items.map((it) => {
    const deltaClass = it.delta > 0 ? 'delta-up' : it.delta < 0 ? 'delta-down' : 'delta-flat';
    const deltaText = it.delta > 0 ? `↑ +${it.delta}` : it.delta < 0 ? `↓ ${it.delta}` : '—';
    return `<tr>
      <td>${it.label}</td>
      <td>${it.previousQty} ${it.unit}</td>
      <td><strong>${it.forecastQty} ${it.unit}</strong></td>
      <td class="${deltaClass}">${deltaText}</td>
      <td class="rationale">${it.rationale}</td>
    </tr>`;
  }).join('');
}

// ---- Proposal ----
function renderProposal() {
  const p = state.currentProposal;
  const kindLabel = p.proposalKind === 'readiness-topup' ? 'Emergency Readiness top-up' : 'Weekly restock';
  $('#proposalSummary').innerHTML = `
    <div class="stat"><div class="value">${fmtUAH(p.totalEstimated)}</div><div class="label">Total estimated</div></div>
    <div class="stat"><div class="value">${p.items.length}</div><div class="label">Line items</div></div>
    <div class="stat"><div class="value">${p.budgetCheck.withinBudget ? badge('Within budget', 'green') : badge('Over budget', 'red')}</div><div class="label">Budget check</div></div>
    <div class="stat"><div class="value">${badge(p.status, 'blue')}</div><div class="label">Status</div></div>
    <div class="stat"><div class="value">${p.sourceMode === 'live' ? badge('Live Silpo data', 'green') : badge('Mock data', 'amber')}</div><div class="label">Data source</div></div>
    <div class="stat"><div class="value">${badge(kindLabel, p.proposalKind === 'readiness-topup' ? 'amber' : 'blue')}</div><div class="label">Run kind</div></div>
  `;
  const tbody = $('#proposalTable tbody');
  tbody.innerHTML = p.items.map((it) => {
    const deltaClass = it.delta > 0 ? 'delta-up' : it.delta < 0 ? 'delta-down' : 'delta-flat';
    return `<tr>
      <td>${it.label}</td>
      <td>${it.previousQty} → <strong>${it.quantity}</strong> <span class="${deltaClass}">${it.delta > 0 ? '↑+' + it.delta : it.delta < 0 ? '↓' + it.delta : ''}</span></td>
      <td>${fmtUAH(it.unitPrice)}</td>
      <td>${fmtUAH(it.lineTotal)}</td>
      <td>${it.onPromotion ? badge('promo', 'green') : ''}</td>
      <td>${it.dataSource === 'live' ? badge('live', 'green') : badge('mock', 'amber')}</td>
      <td class="rationale">${it.reason}</td>
    </tr>`;
  }).join('');
}

// ---- Budget Optimization ----
function renderBudget() {
  const p = state.currentProposal;
  $('#budgetStats').innerHTML = `
    <div class="stat"><div class="value">${fmtUAH(state.budget.weeklyBudgetUAH)}</div><div class="label">Weekly budget</div></div>
    <div class="stat"><div class="value">${fmtUAH(p.totalEstimated)}</div><div class="label">Optimized cost</div></div>
    <div class="stat"><div class="value">${p.budgetCheck.withinBudget ? badge('OK', 'green') : badge('Violation', 'red')}</div><div class="label">Unresolved violations</div></div>
  `;
  $('#budgetNotes').innerHTML = p.budgetCheck.notes.map((n) => `<li>${n}</li>`).join('') || '<li>No adjustments were necessary.</li>';
  $('#historyTable tbody').innerHTML = p.history.map((h) => `<tr><td>${new Date(h.at).toLocaleString('uk-UA')}</td><td>${h.actor}</td><td>${h.action}</td><td>${h.detail}</td></tr>`).join('');
}

// ---- Approval ----
function renderApproval() {
  const p = state.currentProposal;
  if (p.status === 'pending_approval') {
    $('#approvalStatus').innerHTML = `Proposal ${badge('pending_approval', 'amber')} — total ${fmtUAH(p.totalEstimated)}.`;
    $('#approvalForm').style.display = 'flex';
  } else {
    $('#approvalStatus').innerHTML = `Proposal status: ${badge(p.status, p.status === 'approved' ? 'green' : 'red')}`;
    $('#approvalForm').style.display = p.status === 'approved' ? 'none' : 'none';
  }
}

async function decide(decision) {
  const approverName = $('#approverName').value;
  const comment = $('#approverComment').value;
  const result = await api(`/proposals/${state.currentProposal.id}/approval`, {
    method: 'POST',
    body: JSON.stringify({ approverName, decision, comment })
  });
  state.currentProposal = result.proposal;
  renderApproval();
  renderProposal();
  $('#prepareCartBtn').disabled = result.proposal.status !== 'approved';
  markSteps(result.proposal.status === 'approved' ? 'APPROVED' : 'READY_FOR_APPROVAL');
  await renderHistory();
}
$('#approveBtn').addEventListener('click', () => decide('approved'));
$('#rejectBtn').addEventListener('click', () => decide('rejected'));

// ---- Cart handoff ----
function resetCartScreen() {
  $('#prepareCartBtn').disabled = !state.currentProposal || state.currentProposal.status !== 'approved';
  $('#cartResult').innerHTML = '';
}

function renderCartResult(record) {
  $('#cartResult').innerHTML = `
    <div class="stat" style="max-width:320px">
      <div class="value">${record.status === 'prepared' ? badge('prepared', 'green') : badge('failed', 'red')}</div>
      <div class="label">Silpo cart ${record.silpoCartId || '—'}</div>
    </div>
    <p class="rationale">${record.errorDetail || 'Cart re-read confirmed no validation errors. Checkout must be completed manually in the Silpo app/site — this system never places or pays for orders.'}</p>
  `;
}

$('#prepareCartBtn').addEventListener('click', async () => {
  $('#prepareCartBtn').disabled = true;
  $('#cartResult').innerHTML = 'Preparing Silpo cart...';
  try {
    const record = await api(`/proposals/${state.currentProposal.id}/prepare-cart`, { method: 'POST' });
    state.currentCartSync = record;
    markSteps(record.status === 'prepared' ? 'CART_PREPARED' : 'READY_FOR_APPROVAL');
    renderCartResult(record);
    await renderHistory();
  } catch (err) {
    $('#cartResult').innerHTML = `<span class="badge red">Error</span> ${err.message}`;
    $('#prepareCartBtn').disabled = false;
  }
});

// ---- Rehydrate current run/proposal on load (or reload) ----
// The Proposal/Budget/Approval/Cart-Handoff tabs only render from
// state.currentProposal, which was previously set ONLY as a side effect of
// clicking "Run pipeline" in that same browser session/tab. A page reload
// (or opening the dashboard fresh after a run was already approved/prepared
// elsewhere, e.g. via the API directly) left state.currentProposal null and
// those tabs silently stale/blank — including #prepareCartBtn staying
// disabled even for an already-approved proposal. Fix: always re-fetch the
// latest run for the office on boot and rehydrate state from it, exactly
// like renderDashboard/renderHistory already do.
async function rehydrateCurrentRun() {
  const runs = await api(`/offices/${state.officeId}/procurement-runs`);
  const latest = runs[0];
  if (!latest) return;
  state.currentRun = latest;
  if (latest.demandForecastId || latest.procurementProposalId) {
    const detail = await api(`/procurement-runs/${latest.id}`);
    state.currentForecast = detail.forecast;
    state.currentProposal = detail.proposal;
    state.currentCartSync = detail.cartSyncRecord;
    if (state.currentForecast) renderForecast();
    if (state.currentProposal) {
      renderProposal();
      renderBudget();
      renderApproval();
      resetCartScreen();
      if (state.currentCartSync) renderCartResult(state.currentCartSync);
    }
  }
  markSteps(latest.status);
}

// ---- Dashboard ----
async function renderDashboard() {
  const runs = await api(`/offices/${state.officeId}/procurement-runs`);
  const latest = runs[0];
  const budget = state.budget.weeklyBudgetUAH;
  const feedback = await api(`/offices/${state.officeId}/feedback`);

  $('#dashboardStats').innerHTML = `
    <div class="stat"><div class="value">${state.office.name}</div><div class="label">Office</div></div>
    <div class="stat"><div class="value">${fmtUAH(budget)}</div><div class="label">Weekly budget</div></div>
    <div class="stat"><div class="value">${latest && latest.expectedAttendance != null ? latest.expectedAttendance : '—'}</div><div class="label">Expected attendance (latest run)</div></div>
    <div class="stat"><div class="value">${latest ? badge(latest.status, 'blue') : 'No runs yet'}</div><div class="label">Current run status</div></div>
    <div class="stat"><div class="value">${runs.length}</div><div class="label">Total runs</div></div>
  `;

  const alerts = feedback
    .filter((f) => f.signal !== 'JUST_RIGHT')
    .slice(0, 5)
    .map((f) => `<li>${signalBadge(f.signal)} <strong>${f.productKey}</strong> — ${f.note || ''} (${f.weekOf})</li>`)
    .join('');
  $('#dashboardAlerts').innerHTML = alerts ? `<ul class="notes-list">${alerts}</ul>` : '<div class="empty">No consumption alerts.</div>';
}

// ---- History ----
async function renderHistory() {
  const runs = await api(`/offices/${state.officeId}/procurement-runs`);
  const tbody = $('#historyRunsTable tbody');
  const rows = [];
  for (const run of runs) {
    let total = '—';
    let within = '—';
    if (run.procurementProposalId) {
      try {
        const proposal = await api(`/proposals/${run.procurementProposalId}`);
        total = fmtUAH(proposal.totalEstimated);
        within = proposal.budgetCheck?.withinBudget ? badge('yes', 'green') : badge('no', 'red');
      } catch { /* ignore */ }
    }
    rows.push(`<tr><td>${run.weekOf}</td><td>${badge(run.status, 'blue')}</td><td>${total}</td><td>${within}</td><td>${new Date(run.startedAt).toLocaleString('uk-UA')}</td></tr>`);
  }
  tbody.innerHTML = rows.join('') || '<tr><td colspan="5" class="empty">No runs yet.</td></tr>';
}

// ---- Emergency Readiness (Feature 1) ----
async function renderReadiness() {
  const items = await api(`/offices/${state.officeId}/readiness-items`);
  state.readinessItems = items;

  const tbody = $('#readinessTable tbody');
  tbody.innerHTML = items.map((it) => {
    const s = it.shortfall || {};
    const shortfallCell = s.shortfall > 0 ? badge(`${s.shortfall} ${it.unit}`, 'amber') : badge('0', 'green');
    return `<tr>
      <td>${it.label}</td>
      <td>${it.targetQuantity} ${it.unit}</td>
      <td>${s.mostRecentKnownQuantity ?? 0} ${it.unit}</td>
      <td>${shortfallCell}</td>
      <td>${s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleDateString('uk-UA') : 'never checked'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No readiness items configured.</td></tr>';

  const select = $('#stockCheckItem');
  if (select) select.innerHTML = items.map((it) => `<option value="${it.id}">${it.label}</option>`).join('');
}

const submitStockCheckBtn = document.getElementById('submitStockCheck');
if (submitStockCheckBtn) {
  submitStockCheckBtn.addEventListener('click', async () => {
    const readinessItemId = $('#stockCheckItem').value;
    const currentQuantity = Number($('#stockCheckQty').value);
    const note = $('#stockCheckNote').value;
    await api(`/offices/${state.officeId}/readiness-stock-checks`, {
      method: 'POST',
      body: JSON.stringify({ readinessItemId, currentQuantity, note })
    });
    $('#stockCheckNote').value = '';
    await renderReadiness();
  });
}

const runReadinessBtnEl = document.getElementById('runReadinessBtn');
if (runReadinessBtnEl) {
  runReadinessBtnEl.addEventListener('click', async () => {
    $('#readinessRunStatus').textContent = 'Computing shortfalls and resolving to Silpo products...';
    try {
      const result = await api(`/offices/${state.officeId}/readiness-runs`, { method: 'POST' });
      state.currentRun = result.run;
      state.currentForecast = result.forecast;
      state.currentProposal = result.proposal;
      $('#readinessRunStatus').innerHTML = `Run <code class="small">${result.run.id}</code> reached status ${badge(result.run.status, 'blue')}. Total ${fmtUAH(result.proposal.totalEstimated)} across ${result.proposal.items.length} line item(s).`;
      renderForecast();
      renderProposal();
      renderBudget();
      renderApproval();
      resetCartScreen();
      markSteps(result.run.status);
      await renderDashboard();
      await renderHistory();
      await renderReadiness();
    } catch (err) {
      $('#readinessRunStatus').innerHTML = `<span class="badge red">FAILED</span> ${err.message}`;
    }
  });
}

// ---- Blackout-aware branch failover (Feature 2) ----
async function renderBlackoutStatus() {
  const status = await api(`/offices/${state.officeId}/blackout-status`);
  state.blackoutStatus = status;
  const btn = $('#blackoutToggleBtn');
  if (btn) {
    const active = !!status.active;
    btn.textContent = `Blackout: ${active ? 'ON' : 'OFF'}`;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('primary', active);
  }
  $('#blackoutStatusInfo').innerHTML = status.setAt
    ? `Last set by <strong>${status.setBy || 'unknown'}</strong> at ${new Date(status.setAt).toLocaleString('uk-UA')}. Manual toggle — not a live blackout-schedule feed.`
    : 'Not set yet. Manual toggle — not a live blackout-schedule feed.';
  await renderBranchPreview();
}

async function renderBranchPreview() {
  try {
    const preview = await api(`/offices/${state.officeId}/delivery-branch-preview`);
    const sel = preview.branchSelection || {};
    const kind = sel.usedFailover ? badge('blackout rerouting', 'amber') : badge('nearest', 'blue');
    $('#branchPreview').innerHTML = `Using branch <code class="small">${preview.branchId || '—'}</code> ${kind}<br/>${sel.reason || ''}`;
  } catch (err) {
    $('#branchPreview').innerHTML = `<span class="badge red">Error</span> ${err.message}`;
  }
}

const blackoutToggleBtnEl = document.getElementById('blackoutToggleBtn');
if (blackoutToggleBtnEl) {
  blackoutToggleBtnEl.addEventListener('click', async () => {
    const currentlyActive = blackoutToggleBtnEl.getAttribute('aria-pressed') === 'true';
    const setBy = $('#blackoutSetBy').value || 'Офіс-менеджер';
    await api(`/offices/${state.officeId}/blackout-status`, {
      method: 'PUT',
      body: JSON.stringify({ active: !currentlyActive, setBy })
    });
    await renderBlackoutStatus();
  });
}

// ---- Battery recycling log (Silpo "Батарейки, здавайтеся!" eco program) ----
async function renderRecyclingLog() {
  const { entries, totalRecycled } = await api(`/offices/${state.officeId}/recycling-log`);
  $('#recyclingStats').innerHTML = `
    <div class="stat"><div class="value">${totalRecycled}</div><div class="label">Batteries recycled (all time)</div></div>
    <div class="stat"><div class="value">${entries.length}</div><div class="label">Drop-offs logged</div></div>
  `;
  $('#recyclingTable tbody').innerHTML = entries
    .map(
      (e) =>
        `<tr><td>${new Date(e.loggedAt).toLocaleDateString('uk-UA')}</td><td>${e.quantity}</td><td>${e.loggedBy}</td><td>${e.note || '—'}</td></tr>`
    )
    .join('');
}

const submitRecyclingBtnEl = document.getElementById('submitRecycling');
if (submitRecyclingBtnEl) {
  submitRecyclingBtnEl.addEventListener('click', async () => {
    const quantity = Number($('#recyclingQty').value);
    const note = $('#recyclingNote').value;
    try {
      await api(`/offices/${state.officeId}/recycling-log`, {
        method: 'POST',
        body: JSON.stringify({ quantity, note, loggedBy: 'Офіс-менеджер Марина' })
      });
      $('#recyclingNote').value = '';
      await renderRecyclingLog();
    } catch (err) {
      alert(`Could not log recycling drop-off: ${err.message}`);
    }
  });
}

// ---- Resilience screen (power status + AI recommendation + readiness +
// timing + branch resilience + ESG + provenance, composed by
// GET /offices/:id/resilience-plan) ----
function riskBadgeColor(level) {
  switch (level) {
    case 'ACTIVE_BLACKOUT': return 'red';
    case 'HIGH': return 'red';
    case 'PREPARE': return 'amber';
    case 'WATCH': return 'amber';
    case 'NORMAL': return 'green';
    default: return 'gray';
  }
}

function sourceBadge(source, stale) {
  // UNAVAILABLE must win over STALE: "stale" implies data exists but is
  // old, which is misleading when there is genuinely no data at all (the
  // risk model's isStale() deliberately treats missing data as stale too,
  // for risk-calculation safety — but that's a different concern from what
  // this badge should tell a human). Checking source first here fixes a
  // real bug where an UNAVAILABLE state rendered as a plain "STALE" badge.
  if (source === 'UNAVAILABLE') return badge('UNAVAILABLE', 'gray');
  if (stale) return badge('STALE', 'amber');
  if (source === 'MANUAL') return badge('MANUAL', 'blue');
  if (source === 'DEMO') return badge('DEMO', 'gray');
  return badge('UNAVAILABLE', 'gray');
}

function toLocalDatetimeInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function populateResilienceOfficeSelect() {
  const sel = $('#resilienceOfficeSelect');
  if (!sel) return;
  const offices = await api('/offices');
  state.allOffices = offices;
  sel.innerHTML = offices.map((o) => `<option value="${o.id}">${o.name}</option>`).join('');
  sel.value = state.resilienceOfficeId || state.officeId;
}

async function renderResilience() {
  const officeId = $('#resilienceOfficeSelect')?.value || state.officeId;
  state.resilienceOfficeId = officeId;
  $('#resilienceRiskBanner').textContent = 'Loading…';
  try {
    const plan = await api(`/offices/${officeId}/resilience-plan`);
    state.resiliencePlan = plan;

    // Risk banner
    $('#resilienceRiskBanner').innerHTML = `${badge(plan.risk.level, riskBadgeColor(plan.risk.level))} for <strong>${plan.situation.office.name}</strong> — generated ${new Date(plan.generatedAt).toLocaleString('uk-UA')}`;

    // Power status card
    const p = plan.situation.power;
    $('#powerStatusStats').innerHTML = `
      <div class="stat"><div class="value">${badge(p.currentStatus, p.currentStatus === 'active_blackout' ? 'red' : p.currentStatus === 'normal' ? 'green' : 'gray')}</div><div class="label">Current status</div></div>
      <div class="stat"><div class="value">${sourceBadge(p.source, p.stale)}</div><div class="label">Data source</div></div>
      <div class="stat"><div class="value">${p.confidence || '—'}</div><div class="label">Confidence</div></div>
      <div class="stat"><div class="value">${p.nextOutageKyiv ? `${p.nextOutageKyiv.start} → ${p.nextOutageKyiv.end}` : '—'}</div><div class="label">Next outage (Kyiv time)</div></div>
    `;
    const updatedAgo = p.lastUpdatedAt ? Math.round((Date.now() - new Date(p.lastUpdatedAt).getTime()) / 60000) : null;
    $('#powerStatusDetail').innerHTML = `${p.sourceNote || ''}${updatedAgo != null ? ` — updated ${updatedAgo}m ago.` : ''}${p.regionalBlackoutActive ? ' <strong>Regional blackout toggle is ACTIVE for this office.</strong>' : ''}`;

    // Pre-fill manual schedule form with current next outage, if any
    if (p.nextOutage?.start) $('#powerScheduleStart').value = toLocalDatetimeInputValue(p.nextOutage.start);
    if (p.nextOutage?.end) $('#powerScheduleEnd').value = toLocalDatetimeInputValue(p.nextOutage.end);

    // Recommendation
    $('#resilienceRecommendation').innerHTML = `<p>${(plan.recommendation.summary || (plan.recommendation.text || []).join(' '))}</p>`;
    $('#resilienceReasons').innerHTML = (plan.risk.reasons || []).map((r) => `<li>${r}</li>`).join('') || '<li>No reasons recorded.</li>';

    // Readiness table
    const items = plan.situation.readiness.items || [];
    $('#resiliencReadinessTable tbody').innerHTML = items.map((it) => `
      <tr><td>${it.label}</td><td>${it.targetQuantity} ${it.unit}</td><td>${it.mostRecentKnownQuantity} ${it.unit}</td><td>${it.shortfall > 0 ? badge(`${it.shortfall} ${it.unit}`, 'amber') : badge('0', 'green')}</td></tr>
    `).join('') || '<tr><td colspan="4" class="empty">No readiness items configured for this office.</td></tr>';
    $('#resilienceProcurementNote').textContent = plan.procurement.note;

    // Impact Summary (deterministic demo metrics only — see resiliencePlanner.js buildMetrics())
    const m = plan.metrics || {};
    const statOrDash = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);
    $('#resilienceMetrics').innerHTML = `
      <div class="stat"><div class="value">${statOrDash(m.stockCoveragePercent, '%')}</div><div class="label">Emergency stock coverage</div></div>
      <div class="stat"><div class="value">${statOrDash(m.categoriesBelowTarget)} / ${statOrDash(m.categoriesTotal)}</div><div class="label">Categories below target</div></div>
      <div class="stat"><div class="value">${statOrDash(m.procurementLeadTimeHours, 'h')}</div><div class="label">Procurement lead time</div></div>
      <div class="stat"><div class="value">${statOrDash(m.deliveryWindowShiftHours, 'h earlier')}</div><div class="label">Delivery window shift</div></div>
      <div class="stat"><div class="value">${m.generatorAlternativeUsed ? 'Used' : (m.generatorAlternativeFound ? 'Found, not used' : 'None')}</div><div class="label">Generator alternative</div></div>
    `;
    $('#resilienceMetricsNote').textContent = m.note || '';

    // Timing
    $('#resilienceTiming').innerHTML = plan.timing?.rationale
      ? `${plan.timing.rationale}${plan.timing.deliveryWindow ? `<br/>Recommended window: <strong>${plan.timing.deliveryWindow}</strong>` : ''}`
      : 'No timing recommendation — no known upcoming outage.';

    // Logistics
    const lg = plan.logistics || {};
    // MCP provenance badge — derived ONLY from what the gateway actually
    // reported this run (plan.provenance.logistics.source), never
    // hardcoded. 'silpo-mcp-live' only appears when SilpoGateway.mode was
    // genuinely 'live' for this request — see resiliencePlanner.js.
    const logisticsSource = (plan.provenance && plan.provenance.logistics && plan.provenance.logistics.source) || 'unavailable';
    const mcpBadge =
      logisticsSource === 'silpo-mcp-live' ? badge('Silpo catalog · Live MCP', 'green') :
      logisticsSource === 'silpo-mcp-mock' ? badge('Silpo catalog · Mock', 'gray') :
      badge('Silpo catalog · Unavailable', 'gray');
    $('#resilienceLogisticsSourceBadge').innerHTML = mcpBadge;
    if (!lg.available) {
      $('#resilienceLogistics').innerHTML = `${badge('unavailable', 'gray')} ${lg.reason || ''}`;
    } else {
      const sel = lg.branchSelection || {};
      $('#resilienceLogistics').innerHTML = `Using branch <code class="small">${lg.branchId || '—'}</code> ${sel.usedFailover ? badge('generator branch rerouting', 'amber') : badge('nearest branch', 'blue')}<br/>${sel.reason || ''}`;
    }

    // ESG
    $('#resilienceEsgStats').innerHTML = `
      <div class="stat"><div class="value">${plan.esg.totalRecycled}</div><div class="label">Batteries recycled (all time)</div></div>
      <div class="stat"><div class="value">${(plan.esg.recyclingEntries || []).length}</div><div class="label">Drop-offs logged</div></div>
    `;

    // Provenance
    const prov = plan.provenance || {};
    const rows = Object.entries(prov).map(([section, info]) => `
      <tr><td>${section}</td><td>${info.source || '—'}</td><td>${info.confidence || '—'}</td><td>${info.stale ? 'STALE' : (info.note || info.lastCheckedAtByItem ? JSON.stringify(info.lastCheckedAtByItem || {}) : '')}</td></tr>
    `);
    $('#resilienceProvenanceTable tbody').innerHTML = rows.join('');
  } catch (err) {
    $('#resilienceRiskBanner').innerHTML = `<span class="badge red">Error</span> ${err.message}`;
  }
}

const resilienceOfficeSelectEl = document.getElementById('resilienceOfficeSelect');
if (resilienceOfficeSelectEl) {
  resilienceOfficeSelectEl.addEventListener('change', renderResilience);
}
const refreshResilienceBtnEl = document.getElementById('refreshResilienceBtn');
if (refreshResilienceBtnEl) {
  refreshResilienceBtnEl.addEventListener('click', renderResilience);
}

const savePowerScheduleBtnEl = document.getElementById('savePowerScheduleBtn');
if (savePowerScheduleBtnEl) {
  savePowerScheduleBtnEl.addEventListener('click', async () => {
    const status = $('#powerScheduleSaveStatus');
    const officeId = $('#resilienceOfficeSelect')?.value || state.officeId;
    const startLocal = $('#powerScheduleStart').value;
    const endLocal = $('#powerScheduleEnd').value;
    const note = $('#powerScheduleNote').value;
    if (!startLocal || !endLocal) {
      status.innerHTML = '<span class="badge red">Error</span> Both start and end are required.';
      return;
    }
    status.textContent = 'Saving…';
    try {
      const start = new Date(startLocal).toISOString();
      const end = new Date(endLocal).toISOString();
      await api(`/offices/${officeId}/power-schedule`, {
        method: 'PUT',
        body: JSON.stringify({ start, end, note, currentStatus: 'normal' })
      });
      status.innerHTML = '<span class="badge green">Saved</span> Manual schedule is now the active source for this office.';
      await renderResilience();
    } catch (err) {
      status.innerHTML = `<span class="badge red">Error</span> ${err.message}`;
    }
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:40px;color:red">Failed to load: ${err.message}</p>`;
});
