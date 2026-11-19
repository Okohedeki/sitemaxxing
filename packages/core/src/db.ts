import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT CHECK(mode IN ('repo','url')) NOT NULL,
  root_path TEXT NOT NULL, dev_url TEXT NOT NULL, category TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sections(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, selector TEXT NOT NULL, "order" INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS passes(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, def_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
  section_id TEXT, "order" INTEGER NOT NULL, depends_on TEXT NOT NULL DEFAULT '[]', points INTEGER NOT NULL DEFAULT 0,
  status TEXT CHECK(status IN ('proposed','previewing','approved','rejected','stale','skipped','committed')) NOT NULL,
  chosen_variant_id TEXT, skip_reason TEXT, findings TEXT NOT NULL DEFAULT '[]', summary TEXT, copy_diff TEXT);
CREATE TABLE IF NOT EXISTS variants(
  id TEXT PRIMARY KEY, pass_id TEXT NOT NULL, label TEXT NOT NULL, patch_path TEXT, thumbnail_svg TEXT,
  source TEXT CHECK(source IN ('rule','library','generated','plugin')) NOT NULL DEFAULT 'library', attributes TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS versions(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, number INTEGER NOT NULL, git_sha TEXT NOT NULL, mog_score REAL NOT NULL,
  pass_ids TEXT NOT NULL DEFAULT '[]', variant_map TEXT NOT NULL DEFAULT '{}', screenshots TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decisions(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'local', project_id TEXT NOT NULL, pass_id TEXT, variant_id TEXT,
  action TEXT CHECK(action IN ('preview','pick','approve','reject','regenerate','commit')) NOT NULL,
  shown_alongside TEXT NOT NULL DEFAULT '[]', reason_chip TEXT, dwell_ms INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scores(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT, mog_score REAL NOT NULL, metrics TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS briefs(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, brief TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_passes_project ON passes(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, number);
`;

/** Columns added after v0.1. Each runs once; a duplicate-column error means it already ran. */
const MIGRATIONS = [
  `ALTER TABLE passes ADD COLUMN rationale TEXT`,
  `ALTER TABLE passes ADD COLUMN seed INTEGER`,
  `ALTER TABLE decisions ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'`,
  `CREATE INDEX IF NOT EXISTS idx_briefs_project ON briefs(project_id, created_at)`,
];

export type DB = Database.Database;

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {
      /* column already exists */
    }
  }
  return db;
}

export const newId = (): string => randomUUID().slice(0, 12);
export const now = (): string => new Date().toISOString();

export const json = {
  parse<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  },
  str(v: unknown): string {
    return JSON.stringify(v ?? null);
  },
};
