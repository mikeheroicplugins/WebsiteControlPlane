import { env } from 'cloudflare:workers';

export type SiteRecord = {
  id: string;
  name: string;
  domain: string;
  status: string;
  region: string;
  pod: string;
  wp: string;
  php: string;
  updates: number;
  uptime: string;
};

const seedSites: SiteRecord[] = [
  { id: 'site_juniper', name: 'Juniper Studio', domain: 'juniper.studio', status: 'Running', region: 'US West', pod: 'Standard', wp: '6.8.2', php: '8.3', updates: 0, uptime: '100%' },
  { id: 'site_northstar', name: 'Northstar Legal', domain: 'northstarlegal.co', status: 'Running', region: 'US Central', pod: 'Performance', wp: '6.8.2', php: '8.3', updates: 3, uptime: '99.99%' },
  { id: 'site_paperpine', name: 'Paper & Pine', domain: 'paperandpine.shop', status: 'Running', region: 'Canada', pod: 'Standard', wp: '6.8.1', php: '8.2', updates: 7, uptime: '99.97%' },
  { id: 'site_kitehouse', name: 'Kitehouse', domain: 'kitehouse.design', status: 'Maintenance', region: 'Germany', pod: 'Micro', wp: '6.8.2', php: '8.3', updates: 1, uptime: '99.94%' },
  { id: 'site_arcwell', name: 'Arcwell Health', domain: 'arcwell.health', status: 'Running', region: 'US East', pod: 'Power', wp: '6.8.2', php: '8.3', updates: 0, uptime: '100%' },
];

function db(): D1Database {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  return env.DB;
}

export async function ensureDatabase(ownerId: string) {
  const d1 = db();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      domain TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Deploying',
      region TEXT NOT NULL DEFAULT 'US West', pod TEXT NOT NULL DEFAULT 'Standard',
      wp_version TEXT NOT NULL DEFAULT '6.8.2', php_version TEXT NOT NULL DEFAULT '8.3',
      updates INTEGER NOT NULL DEFAULT 0, uptime TEXT NOT NULL DEFAULT '—',
      created_at INTEGER NOT NULL
    )`),
    d1.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_owner_domain ON sites(owner_id, domain)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_sites_owner_status ON sites(owner_id, status)'),
    d1.prepare(`CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, site_id TEXT NOT NULL,
      type TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
      summary TEXT NOT NULL, created_at INTEGER NOT NULL
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_operations_owner_created ON operations(owner_id, created_at)'),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_operations_site_created ON operations(site_id, created_at)'),
    d1.prepare(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, created_at INTEGER NOT NULL
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_clients_owner_name ON clients(owner_id, name)'),
    d1.prepare(`CREATE TABLE IF NOT EXISTS blueprints (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      wp_version TEXT NOT NULL, size_mb INTEGER NOT NULL, created_at INTEGER NOT NULL
    )`),
    d1.prepare('CREATE INDEX IF NOT EXISTS idx_blueprints_owner_name ON blueprints(owner_id, name)'),
    d1.prepare('PRAGMA optimize'),
  ]);

  const count = await d1.prepare('SELECT COUNT(*) AS count FROM sites WHERE owner_id = ?').bind(ownerId).first<{ count: number }>();
  if (!count?.count) {
    await d1.batch(seedSites.map((site, index) => d1.prepare(`INSERT OR IGNORE INTO sites
      (id, owner_id, name, domain, status, region, pod, wp_version, php_version, updates, uptime, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(site.id, ownerId, site.name, site.domain, site.status, site.region, site.pod, site.wp, site.php, site.updates, site.uptime, Date.now() - index * 86400000)));
  }
}

export async function listSites(ownerId: string): Promise<SiteRecord[]> {
  await ensureDatabase(ownerId);
  const result = await db().prepare(`SELECT id, name, domain, status, region, pod,
    wp_version AS wp, php_version AS php, updates, uptime
    FROM sites WHERE owner_id = ? ORDER BY created_at DESC`).bind(ownerId).all<SiteRecord>();
  return result.results;
}

export async function createSite(ownerId: string, input: Pick<SiteRecord, 'name' | 'domain' | 'region' | 'pod'>) {
  await ensureDatabase(ownerId);
  const site: SiteRecord = { id: crypto.randomUUID(), ...input, status: 'Deploying', wp: '6.8.2', php: '8.3', updates: 0, uptime: '—' };
  const operationId = crypto.randomUUID();
  await db().batch([
    db().prepare(`INSERT INTO sites
      (id, owner_id, name, domain, status, region, pod, wp_version, php_version, updates, uptime, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(site.id, ownerId, site.name, site.domain, site.status, site.region, site.pod, site.wp, site.php, 0, site.uptime, Date.now()),
    db().prepare(`INSERT INTO operations (id, owner_id, site_id, type, state, summary, created_at)
      VALUES (?, ?, ?, 'site.provision', 'queued', ?, ?)`)
      .bind(operationId, ownerId, site.id, `Provision ${site.name}`, Date.now()),
  ]);
  return site;
}

export async function queueSiteOperation(ownerId: string, siteId: string, type: string) {
  await ensureDatabase(ownerId);
  const operation = { id: crypto.randomUUID(), state: 'queued', summary: `${type.replace('site.', '')} requested`, createdAt: Date.now() };
  await db().prepare(`INSERT INTO operations (id, owner_id, site_id, type, state, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(operation.id, ownerId, siteId, type, operation.state, operation.summary, operation.createdAt).run();
  return operation;
}
