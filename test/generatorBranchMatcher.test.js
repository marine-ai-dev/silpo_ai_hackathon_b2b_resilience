import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchOne, matchAll } from '../src/silpo/generatorBranchMatcher.js';

const silpoBranches = [
  { branchId: 'b1', city: 'Дніпро', address: 'просп. Науки, 3' },
  { branchId: 'b2', city: 'Дніпро', address: 'вул. Європейська, 18А' },
  { branchId: 'b3', city: 'Дніпро', address: 'бульв. Слави, 5' },
  { branchId: 'b4', city: 'Запоріжжя', address: 'вул. Вінтера, 30/3' },
  { branchId: 'b5', city: 'Вінниця', address: 'пл. Соборна, 1' }
];

test('EXACT: byte-identical (normalized) address in the same city', () => {
  const result = matchOne({ city: 'Дніпро', address: 'просп. Науки, 3' }, silpoBranches);
  assert.equal(result.confidence, 'EXACT');
  assert.equal(result.resolvedBranchId, 'b1');
});

test('HIGH_CONFIDENCE: same street+building, Cyrillic/Latin building-suffix case difference', () => {
  const result = matchOne({ city: 'Дніпро', address: 'вул. Європейська, 18a' }, silpoBranches);
  assert.equal(result.confidence, 'HIGH_CONFIDENCE');
  assert.equal(result.resolvedBranchId, 'b2');
});

test('HIGH_CONFIDENCE: street-type abbreviation variant (бул./бульв.)', () => {
  const result = matchOne({ city: 'Дніпро', address: 'бул. Слави, 5' }, silpoBranches);
  assert.equal(result.confidence, 'HIGH_CONFIDENCE');
  assert.equal(result.resolvedBranchId, 'b3');
});

test('AMBIGUOUS: street TYPE genuinely differs (бул. vs вул.) plus a building sub-unit suffix -> never resolved', () => {
  const result = matchOne({ city: 'Запоріжжя', address: 'бул. Вінтера, 30' }, silpoBranches);
  assert.equal(result.confidence, 'AMBIGUOUS');
  assert.equal(result.resolvedBranchId, null, 'an ambiguous match must never resolve to a branchId');
});

test('UNMATCHED: same city, no candidate resembles the address at all', () => {
  const result = matchOne({ city: 'Вінниця', address: 'вул. Зовсім Інша, 999' }, silpoBranches);
  assert.equal(result.confidence, 'UNMATCHED');
  assert.equal(result.resolvedBranchId, null);
});

test('UNMATCHED: no candidates in that city at all', () => {
  const result = matchOne({ city: 'Одеса', address: 'вул. Дерибасівська, 1' }, silpoBranches);
  assert.equal(result.confidence, 'UNMATCHED');
  assert.equal(result.method, 'no_city_candidates');
});

test('matchAll: preserves original fields and classifies every row', () => {
  const generatorBranches = [
    { city: 'Дніпро', address: 'просп. Науки, 3', sourceNote: 'snapshot' },
    { city: 'Одеса', address: 'вул. Дерибасівська, 1', sourceNote: 'snapshot' }
  ];
  const results = matchAll(generatorBranches, silpoBranches);
  assert.equal(results.length, 2);
  assert.equal(results[0].sourceNote, 'snapshot', 'original fields must survive the merge');
  assert.equal(results[0].confidence, 'EXACT');
  assert.equal(results[1].confidence, 'UNMATCHED');
});
