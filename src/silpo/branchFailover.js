// branchFailover — pure, defensive helper functions used by
// SilpoGateway.resolveDeliveryContext() to implement a SOFT preference for
// a generator-backed branch when the office's region is in an active
// (manually-toggled) blackout. Kept as small pure functions, independent of
// the Silpo client, so they're unit-testable without mocking network/MCP
// calls (see test/branchFailover.test.js).
//
// This is intentionally NOT a live monitoring integration:
//   - RegionalBlackoutStatus.active is set by a human via the UI toggle.
//   - GeneratorBranch is a manually-refreshed snapshot of
//     https://silpo.ua/de-pracyuiemo-na-generatorax (see seed data / docs).
// Both are documented extension points for a real API, if one is ever
// confirmed to exist (see docs/b2b-mvp/ROADMAP.md).

/** Best-effort "city" extraction from a free-text address. Ukrainian
 * addresses appear in the wild in both orders — "вул. Хрещатик 1, Київ"
 * (city last, the convention this app's own seed data uses) and
 * "м. Вінниця, вул. Козицького, 42" (city first, with a "м."/"місто"
 * prefix, the convention Silpo's own generator-branch page and many
 * real addresses use — see scripts/seed.js's GENERATOR_BRANCHES list).
 * Try the "м./місто X" prefix first since it's unambiguous; only then
 * fall back to "last comma-separated segment," and reject that fallback
 * if it's just a house number (e.g. "42", "2а") rather than a real city
 * name — a bare number/number+letter is never a city. Returns null for
 * anything unusable. */
export function extractCity(addressText) {
  if (!addressText || typeof addressText !== 'string') return null;
  const prefixMatch = addressText.match(/(?:^|,)\s*(?:м\.|місто)\s*([^,]+)/iu);
  if (prefixMatch) {
    const city = prefixMatch[1].trim();
    if (city) return city;
  }
  const parts = addressText.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  if (!last || /^\d+[а-яіїєА-ЯІЇЄ]?$/u.test(last)) return null; // looks like a bare house number, not a city
  return last;
}

/**
 * Decide which branchId to actually use for delivery, given:
 *   - normalBranchId: whatever the existing geography-based resolution chose
 *   - normalCity: best-effort city of the office (may be null)
 *   - blackoutStatus: RegionalBlackoutStatus | null
 *   - generatorBranches: GeneratorBranch[]
 *
 * Never throws — always returns a usable result, falling back to the normal
 * branch whenever blackout status isn't active, the city is unknown, no
 * generator-branch match exists for the city, or a matched branch has no
 * confirmed silpoBranchId (best-effort match only, never forced/fuzzy).
 */
export function applyBlackoutFailover({ normalBranchId, normalCity, blackoutStatus, generatorBranches }) {
  try {
    if (!blackoutStatus || !blackoutStatus.active) {
      return {
        branchId: normalBranchId,
        usedFailover: false,
        reason: 'Blackout not marked active for this office — using the normal nearest-branch selection.'
      };
    }

    if (!normalCity) {
      return {
        branchId: normalBranchId,
        usedFailover: false,
        reason: 'Blackout marked active, but the office city could not be determined from its address — falling back to the normal branch selection.'
      };
    }

    const candidatesInCity = (generatorBranches || []).filter(
      (g) => (g.city || '').trim().toLowerCase() === normalCity.trim().toLowerCase()
    );

    if (!candidatesInCity.length) {
      return {
        branchId: normalBranchId,
        usedFailover: false,
        reason: `Blackout marked active in "${normalCity}", but no known generator-backed branch is on record for this city — falling back to the normal branch selection.`
      };
    }

    // Prefer a candidate with a CONFIRMED match (EXACT/HIGH_CONFIDENCE ->
    // silpoBranchId set at seed time — see scripts/seed.js /
    // generatorBranchMatcher.js). Never select an AMBIGUOUS/UNMATCHED
    // candidate for actual rerouting, even if it happens to appear first
    // in the list for this city — this check is defense-in-depth on top
    // of silpoBranchId already being left null for those rows.
    const confirmed = candidatesInCity.find(
      (g) => g.silpoBranchId && (g.matchConfidence === 'EXACT' || g.matchConfidence === 'HIGH_CONFIDENCE')
    );

    if (!confirmed) {
      // Still surface the best candidate found (even if ambiguous/unmatched)
      // so the UI can honestly explain what's on record without acting on it.
      const bestUnconfirmed = candidatesInCity[0];
      return {
        branchId: normalBranchId,
        usedFailover: false,
        generatorBranch: bestUnconfirmed,
        reason: `Blackout marked active in "${normalCity}" — a generator-backed branch is on record (${bestUnconfirmed.address}, match confidence: ${bestUnconfirmed.matchConfidence || 'UNMATCHED'}), but it has no confirmed Silpo branchId match yet, so delivery still routes through the normal branch selection.`
      };
    }

    return {
      branchId: confirmed.silpoBranchId,
      usedFailover: true,
      generatorBranch: confirmed,
      reason: `Blackout marked active in "${normalCity}" — rerouting delivery to a generator-backed branch: ${confirmed.address} (match confidence: ${confirmed.matchConfidence}, source: ${confirmed.sourceNote}).`
    };
  } catch (err) {
    // Defensive: this logic must never break the delivery-context pipeline.
    return {
      branchId: normalBranchId,
      usedFailover: false,
      reason: `Blackout failover check failed defensively (${err.message}) — using the normal branch selection.`
    };
  }
}
