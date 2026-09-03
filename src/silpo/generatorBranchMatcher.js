// generatorBranchMatcher — deterministic, confidence-classified matching
// between the manually-captured GeneratorBranch snapshot (seeded from
// silpo.ua/de-pracyuiemo-na-generatorax, see docs/b2b-mvp/ROADMAP.md) and
// real Silpo branches (silpo_list_branches). Pure functions, no MCP calls
// here — the actual live silpo_list_branches data is fetched once by a
// human/agent with MCP access and passed in; see
// docs/b2b-resilience/LIVE_MCP_VERIFICATION.md and
// scripts/matchGeneratorBranches.js for how the real match run was done
// and how its results got persisted into scripts/seed.js.
//
// Confidence levels (never silently upgraded, never auto-used above the
// bar branchFailover.js enforces):
//   EXACT           — normalized address strings are byte-identical.
//   HIGH_CONFIDENCE — same street name + same building number, differing
//                     only in abbreviation style (вул./бульв.) or Cyrillic
//                     vs Latin letter-casing on a building-number suffix
//                     (e.g. "18a" vs "18А") — a real person would call
//                     these "obviously the same address."
//   AMBIGUOUS       — some resemblance (e.g. same building number) but a
//                     genuine discrepancy exists (different street TYPE
//                     token like бул. vs вул., or a building sub-unit
//                     suffix like "/3" the snapshot doesn't have) — could
//                     be the same place with a transcription slip, could
//                     be a different building entirely. Never resolved to
//                     a branchId automatically.
//   UNMATCHED       — no candidate found in the same city at all.

const STREET_TYPE_WORDS = ['вул', 'вулиця', 'просп', 'проспект', 'бул', 'бульв', 'бульвар', 'пров', 'провулок', 'шосе', 'пл', 'площа', 'наб', 'набережна'];

function normalizeAddress(address) {
  if (!address) return { streetType: '', streetName: '', buildingNumber: '' };
  const lower = address.toLowerCase().replace(/\./g, '');
  const tokens = lower.split(',').map((s) => s.trim()).filter(Boolean);
  // Typical shape: "<streetType> <streetName>, <buildingNumber>" or "<streetName streetType>, <buildingNumber>"
  const buildingNumber = (tokens[tokens.length - 1] || '')
    .replace(/[^\wа-яіїєґ0-9/]/gi, '')
    .replace(/а$/i, 'a') // normalize trailing Cyrillic А vs Latin a on building suffixes
    .trim();
  const streetPart = tokens.slice(0, -1).join(' ') || tokens[0] || '';
  let streetType = '';
  let streetNameWords = [];
  for (const word of streetPart.split(/\s+/)) {
    if (STREET_TYPE_WORDS.includes(word) && !streetType) {
      streetType = word;
    } else {
      streetNameWords.push(word);
    }
  }
  return {
    streetType,
    streetName: streetNameWords.join(' ').replace(/[^\wа-яіїєґ0-9]/gi, ''),
    buildingNumber
  };
}

/**
 * @param {{city, address}} generatorBranch - one seeded snapshot row
 * @param {Array<{branchId, city, address}>} silpoBranches - real silpo_list_branches rows for the same city
 * @returns {{confidence: 'EXACT'|'HIGH_CONFIDENCE'|'AMBIGUOUS'|'UNMATCHED', resolvedBranchId: string|null, method: string, candidate: object|null}}
 */
export function matchOne(generatorBranch, silpoBranches) {
  const candidates = (silpoBranches || []).filter(
    (b) => (b.city || '').trim().toLowerCase() === (generatorBranch.city || '').trim().toLowerCase()
  );
  if (!candidates.length) {
    return { confidence: 'UNMATCHED', resolvedBranchId: null, method: 'no_city_candidates', candidate: null };
  }

  const target = normalizeAddress(generatorBranch.address);

  // Pass 1: EXACT — fully normalized string match on the raw address.
  const stripAll = (s) => (s || '').toLowerCase().replace(/[^\wа-яіїєґ0-9]/gi, '');
  const targetExact = stripAll(generatorBranch.address);
  const exact = candidates.find((c) => stripAll(c.address) === targetExact);
  if (exact) {
    return { confidence: 'EXACT', resolvedBranchId: exact.branchId, method: 'exact_normalized_string', candidate: exact };
  }

  // Pass 2: HIGH_CONFIDENCE — same streetName + same buildingNumber,
  // street TYPE token may differ only if it's a known abbreviation
  // variant pair (бул/бульв), and building-number letter-casing may differ.
  const ABBREV_EQUIV = [['бул', 'бульв'], ['просп', 'проспект'], ['вул', 'вулиця'], ['пров', 'провулок'], ['пл', 'площа']];
  const sameAbbrevFamily = (a, b) => a === b || ABBREV_EQUIV.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

  for (const c of candidates) {
    const cand = normalizeAddress(c.address);
    if (cand.streetName === target.streetName && cand.buildingNumber === target.buildingNumber) {
      if (sameAbbrevFamily(cand.streetType, target.streetType) || (!cand.streetType) !== (!target.streetType) === false) {
        return { confidence: 'HIGH_CONFIDENCE', resolvedBranchId: c.branchId, method: 'street_name_and_building_match_abbrev_or_case_diff', candidate: c };
      }
    }
  }

  // Pass 3: AMBIGUOUS — same building number, but street type genuinely
  // differs (not a known abbreviation pair) or a building sub-unit suffix
  // appears on only one side. Report the best candidate but never resolve it.
  for (const c of candidates) {
    const cand = normalizeAddress(c.address);
    const buildingRoot = (s) => (s || '').split('/')[0];
    if (buildingRoot(cand.buildingNumber) === buildingRoot(target.buildingNumber) && cand.buildingNumber) {
      return { confidence: 'AMBIGUOUS', resolvedBranchId: null, method: 'building_number_match_street_type_or_suffix_mismatch', candidate: c };
    }
  }

  return { confidence: 'UNMATCHED', resolvedBranchId: null, method: 'no_candidate_resembles_address', candidate: null };
}

export function matchAll(generatorBranches, silpoBranches) {
  return generatorBranches.map((g) => ({ ...g, ...matchOne(g, silpoBranches) }));
}
