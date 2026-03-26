import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';

// Store the database file in the root of the project for simplicity in this local tool
const sqlite = new Database(path.join(process.cwd(), 'dashboard.db'));
export const db = drizzle(sqlite, { schema });

// Initialize database (sync schema for this small tool)
// In a larger app, we'd use migrations, but for this local script-style app, we can just ensure tables exist.
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      repeat_count INTEGER DEFAULT 1,
      start_time TEXT DEFAULT '09:00',
      repeat_interval TEXT DEFAULT 'daily',
      status TEXT DEFAULT 'idle',
      last_run TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS wells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_id INTEGER REFERENCES routines(id) ON DELETE CASCADE,
      plate_number INTEGER NOT NULL,
      well_id TEXT NOT NULL,
      step_amount INTEGER DEFAULT 1,
      delay_between_step INTEGER DEFAULT 1,
      light_time REAL DEFAULT 1.0,
      exposure_time INTEGER DEFAULT 50000,
      switch_plate INTEGER DEFAULT 0,
      processed INTEGER DEFAULT 0,
      picture_path TEXT
    );
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      well_id INTEGER REFERENCES wells(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
