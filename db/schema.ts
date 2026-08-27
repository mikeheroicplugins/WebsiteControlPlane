import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  status: text('status').notNull().default('Deploying'),
  region: text('region').notNull().default('US West'),
  pod: text('pod').notNull().default('Standard'),
  wpVersion: text('wp_version').notNull().default('6.8.2'),
  phpVersion: text('php_version').notNull().default('8.3'),
  updates: integer('updates').notNull().default(0),
  uptime: text('uptime').notNull().default('—'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_sites_owner_domain').on(table.ownerId, table.domain),
  index('idx_sites_owner_status').on(table.ownerId, table.status),
]);

export const operations = sqliteTable('operations', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  siteId: text('site_id').notNull(),
  type: text('type').notNull(),
  state: text('state').notNull().default('queued'),
  summary: text('summary').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_operations_owner_created').on(table.ownerId, table.createdAt),
  index('idx_operations_site_created').on(table.siteId, table.createdAt),
]);

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_clients_owner_name').on(table.ownerId, table.name)]);

export const blueprints = sqliteTable('blueprints', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  wpVersion: text('wp_version').notNull(),
  sizeMb: integer('size_mb').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_blueprints_owner_name').on(table.ownerId, table.name)]);
