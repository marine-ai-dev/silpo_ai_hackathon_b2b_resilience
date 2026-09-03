// Seed script — creates one demo Company/Office ("Demo Tech Office" /
// "Kyiv HQ"), a RecurringSupplyPlan (water/coffee/tea/milk/fruit/snacks),
// an OfficeBudget + ProcurementPolicy, 5 weeks of ConsumptionRecord history
// with visible week-over-week variation, and SupplyFeedback entries that
// deliberately cover all three signals so the DemandAgent has something
// real to react to on first run:
//   - water: recent NOT_ENOUGH -> agent should recommend an increase
//   - milk:  recent JUST_RIGHT -> no change
//   - snacks: recent TOO_MUCH  -> agent should recommend a decrease
// Next week's expected attendance (28) is also set above the baseline
// member count used for the trailing history (24), so attendance scaling
// visibly moves quantities too.
//
// Run directly (`npm run seed`) to force a reseed, or import
// `seedIfEmpty()` to auto-seed on server boot only if the DB is empty.

import { collections, resetDatabase } from '../src/repositories/jsonStore.js';
import { DemoScheduleProvider } from '../src/power/DemoScheduleProvider.js';

const OFFICE_ID = 'office-kyiv-hq';
const COMPANY_ID = 'company-demo-tech-office';
const HISTORICAL_MEMBER_COUNT = 24;
const NEXT_WEEK_EXPECTED_ATTENDANCE = 28;

const SUPPLY_ITEMS = [
  { productKey: 'water', label: 'Питна вода', category: 'water', unit: 'л', silpoCategorySlug: 'voda-52-1', targetProductQuery: 'вода негазована' },
  { productKey: 'coffee', label: 'Кава в зернах', category: 'coffee', unit: 'кг', silpoCategorySlug: 'kava-359-1', targetProductQuery: 'кава в зернах' },
  { productKey: 'tea', label: 'Чорний чай', category: 'tea', unit: 'пач', silpoCategorySlug: 'chai-359-2', targetProductQuery: 'чай чорний' },
  { productKey: 'milk', label: 'Молоко', category: 'milk', unit: 'л', silpoCategorySlug: 'moloko-234-1', targetProductQuery: 'молоко' },
  { productKey: 'fruit', label: 'Свіжі фрукти', category: 'fruit', unit: 'кг', silpoCategorySlug: 'frukty-19-1', targetProductQuery: 'фрукти' },
  { productKey: 'snacks', label: 'Снеки до кави', category: 'snacks', unit: 'пач', silpoCategorySlug: 'sneky-ta-chypsy-5016', targetProductQuery: 'печиво' }
];

function isoMondayWeeksAgo(n) {
  const now = new Date('2026-09-02T00:00:00+03:00'); // "today" per session context
  const day = now.getDay() || 7;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - (day - 1));
  const target = new Date(thisMonday);
  target.setDate(thisMonday.getDate() - n * 7);
  return target.toISOString().slice(0, 10);
}

export function nextWeekOf() {
  const now = new Date('2026-09-02T00:00:00+03:00');
  const day = now.getDay() || 7;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - (day - 1));
  const next = new Date(thisMonday);
  next.setDate(thisMonday.getDate() + 7);
  return next.toISOString().slice(0, 10);
}

function buildConsumptionHistory() {
  // Baselines per item with plausible week-over-week variation.
  const baselines = { water: 40, coffee: 2.2, tea: 3, milk: 15, fruit: 12, snacks: 14 };
  const variation = { water: [0, 4, -3, 2, -2], coffee: [0, -0.2, 0.3, -0.1, 0.2], tea: [0, 0.5, -0.5, 0, 1], milk: [0, 1, -1, 2, -1], fruit: [0, 2, -1, 1, 0], snacks: [0, 2, 3, 1, 4] };
  const records = [];
  for (let w = 5; w >= 1; w--) {
    const weekOf = isoMondayWeeksAgo(w);
    for (const item of SUPPLY_ITEMS) {
      const idx = 5 - w;
      const qty = Math.max(1, Math.round((baselines[item.productKey] + (variation[item.productKey]?.[idx] ?? 0)) * 10) / 10);
      records.push({
        officeId: OFFICE_ID,
        weekOf,
        productKey: item.productKey,
        productName: item.label,
        quantity: qty,
        unit: item.unit
      });
    }
  }
  return records;
}

function buildFeedback() {
  const lastWeek = isoMondayWeeksAgo(1);
  const twoWeeksAgo = isoMondayWeeksAgo(2);
  return [
    { officeId: OFFICE_ID, weekOf: lastWeek, productKey: 'water', signal: 'NOT_ENOUGH', note: 'Water ran out by Thursday afternoon two weeks running.' },
    { officeId: OFFICE_ID, weekOf: lastWeek, productKey: 'milk', signal: 'JUST_RIGHT', note: 'Milk supply matched demand well.' },
    { officeId: OFFICE_ID, weekOf: lastWeek, productKey: 'snacks', signal: 'TOO_MUCH', note: 'Cookies left over every week, half a box unused.' },
    { officeId: OFFICE_ID, weekOf: twoWeeksAgo, productKey: 'water', signal: 'NOT_ENOUGH', note: 'Same issue as before.' }
  ];
}

export function seed() {
  resetDatabase();

  collections.companies.insert({ id: COMPANY_ID, name: 'Demo Tech Office', createdAt: new Date().toISOString() });

  collections.offices.insert({
    id: OFFICE_ID,
    companyId: COMPANY_ID,
    name: 'Kyiv HQ',
    address: { text: 'вул. Хрещатик 1, Київ', lat: 50.4501, lon: 30.5234 },
    memberCount: HISTORICAL_MEMBER_COUNT,
    createdAt: new Date().toISOString()
  });

  collections.officeMembers.insert({ officeId: OFFICE_ID, name: 'Демо-команда (24 осіб)', dietaryTags: [] });

  collections.recurringSupplyPlans.insert({
    officeId: OFFICE_ID,
    name: 'Щотижневі офісні поставки',
    items: SUPPLY_ITEMS
  });

  collections.officeBudgets.insert({
    officeId: OFFICE_ID,
    weeklyBudgetUAH: 3500
  });

  collections.procurementPolicies.insert({
    officeId: OFFICE_ID,
    maxPerCategoryUAH: { coffee: 1400, snacks: 700 },
    bannedCategorySlugs: [],
    preferPromotions: true
  });

  for (const record of buildConsumptionHistory()) {
    collections.consumptionRecords.insert(record);
  }
  for (const fb of buildFeedback()) {
    collections.supplyFeedback.insert(fb);
  }

  // ---- Feature 1: Emergency Readiness seed items ----
  // Search terms are ONLY the confirmed-real-in-Silpo-catalog ones from the
  // live silpo_find_products_batch checks documented in docs/b2b-mvp/ROADMAP.md
  // (батарейки, LED lighting via "ліхтарик", свічки, подовжувач). Deliberately
  // does NOT include power banks or generators — confirmed NOT sold by Silpo.
  const READINESS_ITEMS = [
    { key: 'readiness-batt-aa', label: 'Батарейки AA', category: 'readiness', unit: 'шт', silpoCategorySlug: 'batareiky-567-3', targetProductQuery: 'duracell aa', targetQuantity: 20, currentQuantity: 4 },
    { key: 'readiness-batt-aaa', label: 'Батарейки AAA', category: 'readiness', unit: 'шт', silpoCategorySlug: 'batareiky-567-3', targetProductQuery: 'varta aaa', targetQuantity: 10, currentQuantity: 2 },
    { key: 'readiness-led-lamp', label: 'LED-ліхтарик / лампа', category: 'readiness', unit: 'шт', silpoCategorySlug: 'osvitlennia-567-4', targetProductQuery: 'led videx', targetQuantity: 4, currentQuantity: 1 },
    { key: 'readiness-candles', label: 'Свічки', category: 'readiness', unit: 'шт', silpoCategorySlug: 'svichky-567-5', targetProductQuery: 'свічки', targetQuantity: 6, currentQuantity: 2 },
    { key: 'readiness-extension-cord', label: 'Подовжувач', category: 'readiness', unit: 'шт', silpoCategorySlug: 'elektryka-567-6', targetProductQuery: 'подовжувач', targetQuantity: 2, currentQuantity: 0 }
  ];

  for (const ri of READINESS_ITEMS) {
    const item = collections.readinessItems.insert({
      officeId: OFFICE_ID,
      label: ri.label,
      category: ri.category,
      unit: ri.unit,
      silpoCategorySlug: ri.silpoCategorySlug,
      targetProductQuery: ri.targetProductQuery,
      targetQuantity: ri.targetQuantity
    });
    collections.readinessStockChecks.insert({
      officeId: OFFICE_ID,
      readinessItemId: item.id,
      currentQuantity: ri.currentQuantity,
      note: 'Seed demo stock check — partial/low stock on hand.',
      checkedAt: new Date().toISOString()
    });
  }

  // ---- Feature 2: GeneratorBranch snapshot (manually captured, NOT a live
  // feed) — a representative subset of the real entries captured via a
  // browser session against https://silpo.ua/de-pracyuiemo-na-generatorax
  // on 2026-09-03 (see docs/b2b-mvp/ROADMAP.md for the full context).
  //
  // matchConfidence/resolvedSilpoBranchId/matchMethod below are the real
  // result of running src/silpo/generatorBranchMatcher.js against a live
  // `silpo_list_branches` fetch (455 branches) on 2026-09-03 — see
  // docs/b2b-resilience/LIVE_MCP_VERIFICATION.md for the run record. This
  // is a one-time reconciliation, not a live re-match on every seed() call
  // (that would require an MCP call at seed time, breaking mock-mode's
  // zero-network guarantee) — `matchedAt` below is fixed to when the real
  // match was performed, not "now."
  const SOURCE_NOTE = 'silpo.ua/de-pracyuiemo-na-generatorax, snapshot 2026-09-03';
  const MATCHED_AT = '2026-09-03T13:00:00.000Z';
  const GENERATOR_BRANCHES = [
    { city: 'Біла Церква', address: 'вул. Героїв Небесної Сотні, 2а', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b28-b1e9-67de-a27c-5d74f7c91ec4', matchMethod: 'exact_normalized_string' },
    { city: 'Біла Церква', address: 'шосе Сквирське, 230', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b24-ec6e-6976-9abd-eb10f39e9fe0', matchMethod: 'exact_normalized_string' },
    { city: 'Бориспіль', address: 'вул. Київський Шлях, 76', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b1a-626d-64ca-9046-0b7012e7f9f8', matchMethod: 'exact_normalized_string' },
    { city: 'Бровари', address: 'вул. Київська, 241', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b4f-d3b9-6a4a-b6b5-d11f2666a570', matchMethod: 'exact_normalized_string' },
    { city: 'Васильків', address: 'вул. Соборна, 64/1', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b36-6a80-6844-9bed-276089a8ab8c', matchMethod: 'exact_normalized_string' },
    { city: 'Вінниця', address: 'пл. Калічанська, 2', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b53-bc53-6a3c-b7c3-d54e0a9fe643', matchMethod: 'exact_normalized_string' },
    { city: 'Вінниця', address: 'вул. Зодчих, 2', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b53-596c-6d06-b5f0-b5ff7ea46636', matchMethod: 'exact_normalized_string' },
    { city: 'Вінниця', address: 'вул. Келецька, 105', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b54-17b2-6d06-9b2f-b5ff7ea46636', matchMethod: 'exact_normalized_string' },
    { city: 'Вінниця', address: 'вул. Оводова Миколи, 51', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b54-d26b-681e-aa85-b5ff7ea46636', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'просп. Науки, 3', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb7361-6304-698e-a1dd-a143e3aed11b', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'вул. Європейська, 18a', matchConfidence: 'HIGH_CONFIDENCE', resolvedSilpoBranchId: '1edb735f-9da6-606c-8fe5-51c4e9ef1e54', matchMethod: 'street_name_and_building_match_abbrev_or_case_diff' },
    { city: 'Дніпро', address: 'вул. Кондратюка Юрія, 4', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb735f-4c36-68d0-9697-a143e3aed11b', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'пров. Крушельницької, 6а', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb7360-7b7d-6cb4-9f28-6dacebae66ad', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'вул. Новокримська, 3а', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb7360-2a1b-69c0-bc02-db14c9aca538', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'вул. Пастера, 6А', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb7369-b87f-6bcc-9e96-73524574f50b', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'бул. Слави, 5', matchConfidence: 'HIGH_CONFIDENCE', resolvedSilpoBranchId: '1edb736a-d34b-6126-9e70-51c4e9ef1e54', matchMethod: 'street_name_and_building_match_abbrev_or_case_diff' },
    { city: 'Дніпро', address: 'просп. Слобожанський, 31д', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb7369-3726-6a08-984d-db14c9aca538', matchMethod: 'exact_normalized_string' },
    { city: 'Дніпро', address: 'просп. Слобожанський, 76/78', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb736a-4582-675e-bf4d-198a97b604e9', matchMethod: 'exact_normalized_string' },
    { city: 'Дрогобич', address: 'вул. Володимира Великого, 7', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6b5c-fb93-695a-bed8-b5ff7ea46636', matchMethod: 'exact_normalized_string' },
    { city: 'Запоріжжя', address: 'вул. Петра Сагайдачного, 20б', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb7373-a25e-603c-878c-6dacebae66ad', matchMethod: 'exact_normalized_string' },
    { city: 'Запоріжжя', address: 'бул. Вінтера, 30', matchConfidence: 'AMBIGUOUS', resolvedSilpoBranchId: null, matchMethod: 'building_number_match_street_type_or_suffix_mismatch' },
    { city: 'Запоріжжя', address: 'вул. Іванова, 1а', matchConfidence: 'EXACT', resolvedSilpoBranchId: '1edb6abb-5f90-6ee6-816d-65b75ffbc21e', matchMethod: 'exact_normalized_string' }
  ];
  for (const gb of GENERATOR_BRANCHES) {
    collections.generatorBranches.insert({
      city: gb.city,
      address: gb.address,
      sourceNote: SOURCE_NOTE,
      // silpoBranchId only ever set for EXACT/HIGH_CONFIDENCE — an
      // AMBIGUOUS or UNMATCHED row keeps this null, per the rule that
      // fuzzy matches are never treated as verified (branchFailover.js
      // enforces the same bar again at use-time, defense in depth).
      silpoBranchId: ['EXACT', 'HIGH_CONFIDENCE'].includes(gb.matchConfidence) ? gb.resolvedSilpoBranchId : null,
      matchConfidence: gb.matchConfidence,
      matchMethod: gb.matchMethod,
      matchedAt: MATCHED_AT
    });
  }

  // RegionalBlackoutStatus intentionally NOT seeded active — a manager
  // toggles it on demand via the UI. Demo office is in Київ, which is not
  // in the captured GeneratorBranch snapshot above, so toggling blackout
  // on for the demo office will honestly show "no generator-branch match
  // for this city — falling back to normal branch selection", which is
  // itself a real, verifiable state of the failover logic.

  // Battery recycling log — real Silpo "Батарейки, здавайтеся!" program
  // (batareiky.ua), manual entries after each office drop-off.
  const RECYCLING_LOG = [
    { daysAgo: 28, quantity: 14, note: 'Перший збір — коробка з-під столу reception' },
    { daysAgo: 14, quantity: 9, note: 'Здано разом із замовленням нових батарейок' },
    { daysAgo: 2, quantity: 6, note: 'Кухня + переговорні кімнати' }
  ];
  for (const r of RECYCLING_LOG) {
    const loggedAt = new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    collections.recyclingLogEntries.insert({
      officeId: OFFICE_ID,
      quantity: r.quantity,
      loggedBy: 'Офіс-менеджер Марина',
      loggedAt,
      note: r.note
    });
  }

  collections.companyThemes.insert({
    companyId: COMPANY_ID,
    companyName: 'MarineAI',
    logoUrl: '',
    accentColor: '#7c5cff',
    accentColorSecondary: '#22d3ee',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // ---- Resilience Scenario A: DEMO power schedule for the primary demo
  // office (Kyiv HQ) — a scheduled outage tomorrow 14:00-18:00 Europe/Kyiv.
  // Seeded via DemoScheduleProvider (source: 'DEMO', never mislabeled
  // 'LIVE'). Combined with the already-seeded low battery/candle stock
  // above (readiness shortfall > 0), this drives PREPARE/HIGH risk on the
  // Resilience screen without a real blackout happening during judging.
  DemoScheduleProvider.seed(OFFICE_ID, {
    start: kyivIsoTomorrowAt(14, 0),
    end: kyivIsoTomorrowAt(18, 0),
    currentStatus: 'normal',
    note: 'Seeded Scenario A demo data — scheduled outage tomorrow 14:00-18:00 Kyiv time. Not a live DTEK feed; see docs/b2b-resilience/DTEK_RESEARCH.md.'
  });

  // ---- Resilience Scenario B: a second demo office in Дніпро, which DOES
  // have a seeded GeneratorBranch match (unlike Kyiv HQ), with
  // RegionalBlackoutStatus.active seeded true so the branch-failover
  // rerouting + ACTIVE_BLACKOUT risk path is demonstrable immediately
  // without toggling anything. Deliberately a SEPARATE office so the
  // primary Kyiv HQ demo (which other scenarios rely on) is never
  // disturbed.
  const DNIPRO_OFFICE_ID = 'office-dnipro-branch';
  collections.offices.insert({
    id: DNIPRO_OFFICE_ID,
    companyId: COMPANY_ID,
    name: 'Дніпро Філія',
    address: { text: 'вул. Наукова 3, Дніпро', lat: 48.4647, lon: 35.0462 },
    memberCount: 12,
    createdAt: new Date().toISOString()
  });
  collections.officeBudgets.insert({ officeId: DNIPRO_OFFICE_ID, weeklyBudgetUAH: 2000 });
  collections.procurementPolicies.insert({
    officeId: DNIPRO_OFFICE_ID,
    maxPerCategoryUAH: {},
    bannedCategorySlugs: [],
    preferPromotions: true
  });
  collections.recurringSupplyPlans.insert({ officeId: DNIPRO_OFFICE_ID, name: 'Щотижневі офісні поставки', items: SUPPLY_ITEMS });

  const DNIPRO_READINESS_ITEMS = [
    { label: 'Батарейки AA', category: 'readiness', unit: 'шт', silpoCategorySlug: 'batareiky-567-3', targetProductQuery: 'duracell aa', targetQuantity: 16, currentQuantity: 3 },
    { label: 'Свічки', category: 'readiness', unit: 'шт', silpoCategorySlug: 'svichky-567-5', targetProductQuery: 'свічки', targetQuantity: 6, currentQuantity: 1 }
  ];
  for (const ri of DNIPRO_READINESS_ITEMS) {
    const item = collections.readinessItems.insert({
      officeId: DNIPRO_OFFICE_ID,
      label: ri.label,
      category: ri.category,
      unit: ri.unit,
      silpoCategorySlug: ri.silpoCategorySlug,
      targetProductQuery: ri.targetProductQuery,
      targetQuantity: ri.targetQuantity
    });
    collections.readinessStockChecks.insert({
      officeId: DNIPRO_OFFICE_ID,
      readinessItemId: item.id,
      currentQuantity: ri.currentQuantity,
      note: 'Seed demo stock check — Scenario B (active blackout, generator branch match).',
      checkedAt: new Date().toISOString()
    });
  }
  collections.regionalBlackoutStatuses.insert({
    officeId: DNIPRO_OFFICE_ID,
    active: true,
    setBy: 'Seed script (Scenario B demo data)',
    setAt: new Date().toISOString(),
    note: 'Seeded active for demo purposes — a real deployment would have an office manager toggle this via the UI.'
  });

  console.log('[seed] Demo data created: office=%s, weeks of history=5, feedback=%d', OFFICE_ID, buildFeedback().length);
  console.log('[seed] Next procurement run week: %s, expected attendance: %d (baseline member count: %d)', nextWeekOf(), NEXT_WEEK_EXPECTED_ATTENDANCE, HISTORICAL_MEMBER_COUNT);
  console.log('[seed] Scenario A: DEMO power schedule seeded for %s (outage tomorrow 14:00-18:00 Kyiv time).', OFFICE_ID);
  console.log('[seed] Scenario B: office=%s, RegionalBlackoutStatus.active=true, Дніпро has generator-branch matches.', DNIPRO_OFFICE_ID);
}

/** Returns an ISO datetime for "tomorrow at HH:MM" in Europe/Kyiv wall-clock
 * time, computed via Intl so it's correct across DST changes rather than
 * assuming a fixed UTC offset. */
function kyivIsoTomorrowAt(hour, minute) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  // Build tomorrow's date in Kyiv-local calendar terms, then find the UTC
  // instant that corresponds to that Kyiv wall-clock time by probing the
  // offset via Intl (handles EEST/EET transitions correctly).
  const tomorrow = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, hour, minute));
  const tzOffsetMinutes = getKyivUtcOffsetMinutes(tomorrow);
  return new Date(tomorrow.getTime() - tzOffsetMinutes * 60000).toISOString();
}

function getKyivUtcOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function seedIfEmpty() {
  if (collections.offices.all().length === 0) {
    seed();
  }
}

export const SEED_CONSTANTS = { OFFICE_ID, COMPANY_ID, HISTORICAL_MEMBER_COUNT, NEXT_WEEK_EXPECTED_ATTENDANCE, DNIPRO_OFFICE_ID: 'office-dnipro-branch' };

// Allow `node scripts/seed.js` to force-reseed.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}
