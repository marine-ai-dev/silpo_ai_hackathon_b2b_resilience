// Tiny file-based JSON persistence layer.
//
// Each "collection" (offices, recurringSupplyPlans, ...) lives as one array
// inside data/db.json. This is deliberately dumb: load whole file, mutate
// array in memory, write whole file back. Good enough for a single-process
// hackathon MVP; swap for a real DB later behind the same `Collection`
// interface.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
// Allow tests to point at an isolated DB file (SILPO_DB_FILE env var) so
// multiple test files that each reset/mutate the store can run in parallel
// (Node's test runner runs files concurrently by default) without clobbering
// each other's data/db.json writes.
const DB_FILE = process.env.SILPO_DB_FILE
  ? path.resolve(process.env.SILPO_DB_FILE)
  : path.join(DATA_DIR, 'db.json');

// Collection names follow the domain model in docs/b2b-mvp/DATA_MODEL.md.
const COLLECTIONS = [
  'companies',
  'offices',
  'officeMembers',
  'recurringSupplyPlans',
  'consumptionRecords',
  'supplyFeedback',
  'procurementPolicies',
  'officeBudgets',
  'demandForecasts',
  'procurementRuns',
  'procurementProposals',
  'approvals',
  'cartSyncRecords',
  'companyThemes',
  'readinessItems',
  'readinessStockChecks',
  'generatorBranches',
  'regionalBlackoutStatuses',
  'recyclingLogEntries',
  'powerSchedules'
];

function emptyDb() {
  const db = {};
  for (const c of COLLECTIONS) db[c] = [];
  return db;
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

function readDb() {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const parsed = JSON.parse(raw || '{}');
  for (const c of COLLECTIONS) {
    if (!Array.isArray(parsed[c])) parsed[c] = [];
  }
  return parsed;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/** Simple synchronous repository over one collection name. */
export class Collection {
  constructor(name) {
    if (!COLLECTIONS.includes(name)) {
      throw new Error(`Unknown collection: ${name}`);
    }
    this.name = name;
  }

  all() {
    return readDb()[this.name];
  }

  find(predicate) {
    return this.all().filter(predicate);
  }

  findOne(predicate) {
    return this.all().find(predicate) ?? null;
  }

  getById(id) {
    return this.findOne((r) => r.id === id);
  }

  insert(record) {
    const db = readDb();
    const withId = { id: record.id ?? randomUUID(), ...record };
    db[this.name].push(withId);
    writeDb(db);
    return withId;
  }

  update(id, patch) {
    const db = readDb();
    const idx = db[this.name].findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db[this.name][idx] = { ...db[this.name][idx], ...patch, id };
    writeDb(db);
    return db[this.name][idx];
  }

  replace(id, record) {
    const db = readDb();
    const idx = db[this.name].findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db[this.name][idx] = { ...record, id };
    writeDb(db);
    return db[this.name][idx];
  }

  remove(id) {
    const db = readDb();
    const before = db[this.name].length;
    db[this.name] = db[this.name].filter((r) => r.id !== id);
    writeDb(db);
    return db[this.name].length < before;
  }

  clearAll() {
    const db = readDb();
    db[this.name] = [];
    writeDb(db);
  }
}

export function resetDatabase() {
  writeDb(emptyDb());
}

export const collections = Object.fromEntries(
  COLLECTIONS.map((name) => [name, new Collection(name)])
);
