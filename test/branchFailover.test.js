import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCity, applyBlackoutFailover } from '../src/silpo/branchFailover.js';

test('extractCity: pulls the last comma-separated segment', () => {
  assert.equal(extractCity('вул. Хрещатик 1, Київ'), 'Київ');
  assert.equal(extractCity('просп. Науки, 3, Дніпро'), 'Дніпро');
  assert.equal(extractCity(''), null);
  assert.equal(extractCity(null), null);
});

const normalBranchId = 'branch-normal-1';
const generatorBranches = [
  { city: 'Дніпро', address: 'просп. Науки, 3', sourceNote: 'snapshot', silpoBranchId: 'branch-gen-dnipro', matchConfidence: 'EXACT', matchMethod: 'exact_normalized_string' },
  { city: 'Вінниця', address: 'пл. Калічанська, 2', sourceNote: 'snapshot', silpoBranchId: null, matchConfidence: 'UNMATCHED', matchMethod: 'no_city_candidates' },
  { city: 'Запоріжжя', address: 'бул. Тестова, 30', sourceNote: 'snapshot', silpoBranchId: null, matchConfidence: 'AMBIGUOUS', matchMethod: 'building_number_match_street_type_or_suffix_mismatch' }
];

test('blackout inactive -> unchanged behavior (normal branch, no failover)', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: 'Дніпро',
    blackoutStatus: { active: false },
    generatorBranches
  });
  assert.equal(result.branchId, normalBranchId);
  assert.equal(result.usedFailover, false);
});

test('blackout status not set at all -> unchanged behavior', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: 'Дніпро',
    blackoutStatus: null,
    generatorBranches
  });
  assert.equal(result.branchId, normalBranchId);
  assert.equal(result.usedFailover, false);
});

test('blackout active + generator match found -> reroutes to generator branch', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: 'Дніпро',
    blackoutStatus: { active: true },
    generatorBranches
  });
  assert.equal(result.branchId, 'branch-gen-dnipro');
  assert.equal(result.usedFailover, true);
  assert.match(result.reason, /rerouting/i);
});

test('blackout active + no generator match for city -> falls back gracefully, does not throw', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: 'Київ',
    blackoutStatus: { active: true },
    generatorBranches
  });
  assert.equal(result.branchId, normalBranchId);
  assert.equal(result.usedFailover, false);
});

test('blackout active + matched city but no confirmed silpoBranchId -> falls back gracefully', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: 'Вінниця',
    blackoutStatus: { active: true },
    generatorBranches
  });
  assert.equal(result.branchId, normalBranchId);
  assert.equal(result.usedFailover, false);
  assert.ok(result.generatorBranch);
});

test('blackout active + unknown city (null) -> falls back gracefully, does not throw', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: null,
    blackoutStatus: { active: true },
    generatorBranches
  });
  assert.equal(result.branchId, normalBranchId);
  assert.equal(result.usedFailover, false);
});

test('blackout active + AMBIGUOUS-confidence match only -> never reroutes, reports the ambiguity honestly', () => {
  const result = applyBlackoutFailover({
    normalBranchId,
    normalCity: 'Запоріжжя',
    blackoutStatus: { active: true },
    generatorBranches
  });
  assert.equal(result.branchId, normalBranchId, 'must never reroute to an AMBIGUOUS-confidence match');
  assert.equal(result.usedFailover, false);
  assert.equal(result.generatorBranch.matchConfidence, 'AMBIGUOUS');
  assert.match(result.reason, /AMBIGUOUS/);
});

test('never throws even with garbage input', () => {
  assert.doesNotThrow(() => {
    applyBlackoutFailover({ normalBranchId: undefined, normalCity: undefined, blackoutStatus: {}, generatorBranches: undefined });
  });
});
