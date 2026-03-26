import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const routines = sqliteTable('routines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  repeatCount: integer('repeat_count').default(1),
  startTime: text('start_time').default('09:00'),
  repeatInterval: text('repeat_interval').default('daily'),
  status: text('status').default('idle'), // idle, running, paused, error
  lastRun: text('last_run'),
  createdAt: text('created_at').default(new Date().toISOString()),
});

export const wells = sqliteTable('wells', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routineId: integer('routine_id').references(() => routines.id, { onDelete: 'cascade' }),
  plateNumber: integer('plate_number').notNull(),
  wellId: text('well_id').notNull(),
  stepAmount: integer('step_amount').default(1),
  delayBetweenStep: integer('delay_between_step').default(1),
  lightTime: real('light_time').default(1.0),
  exposureTime: integer('exposure_time').default(50000),
  switchPlate: integer('switch_plate', { mode: 'boolean' }).default(false),
  processed: integer('processed', { mode: 'boolean' }).default(false),
  picturePath: text('picture_path'),
});

export const downloads = sqliteTable('downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wellId: integer('well_id').references(() => wells.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  status: text('status').default('pending'), // pending, downloading, completed, error
  attempts: integer('attempts').default(0),
  updatedAt: text('updated_at').default(new Date().toISOString()),
});
