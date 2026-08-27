'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type View = 'Overview' | 'Sites' | 'Activity' | 'Settings';
type Filter = 'All' | 'Running' | 'Attention';

type Site = {
  id: string; name: string; domain: string; status: string; phase: string | null; error: string | null;
  region: string; pod: string; wp: string; php: string; updates: number; uptime: string;
  createdAt: string; updatedAt: string; containerId: string | null; containerName: string;
  databaseContainer: string; image: string; directUrl: string | null; siteUrl: string; adminUrl: string;
  backupCount: number; lastBackupAt: string | null; lastScannedAt: string | null;
};

type SystemInfo = {
  connected: boolean; dockerVersion?: string; operatingSystem?: string; cpuCount?: number; memoryBytes?: number;
  totalContainers?: number; runningContainers?: number; managedSites?: number; runningSites?: number;
  provisioningSites?: number; attentionSites?: number;
  edge?: { installed: boolean; running: boolean; container: string; httpPort: number; httpsPort: number };
  agent?: { host: string; port: number }; error?: string;
};

type ActivityEntry = {
  id: string; siteId: string; siteName: string; type: string; state: string; message: string; createdAt: string;
};

const nav: Array<{ view: View; symbol: string }> = [
  { view: 'Overview', symbol: '⌂' }, { view: 'Sites', symbol: '▦' },
  { view: 'Activity', symbol: '≡' }, { view: 'Settings', symbol: '⚙' },
];

export default function Home() {
  const [view, setView] = useState<View>('Sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [system, setSystem] = useState<SystemInfo>({ connected: false });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [launchOpen, setLaunchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [systemResponse, sitesResponse, activityResponse] = await Promise.all([
        fetch('/api/system', { cache: 'no-store' }), fetch('/api/sites', { cache: 'no-store' }), fetch('/api/activity', { cache: 'no-store' }),
      ]);
      const [systemData, sitesData, activityData] = await Promise.all([
        systemResponse.json().catch(() => ({ connected: false, error: 'Unable to read Docker status.' })),
        sitesResponse.json().catch(() => ({ sites: [] })), activityResponse.json().catch(() => ({ activity: [] })),
      ]) as [SystemInfo, { sites?: Site[]; error?: string }, { activity?: ActivityEntry[] }];
      setSystem(systemData);
      if (sitesResponse.ok) setSites(sitesData.sites || []);
      if (activityResponse.ok) setActivity(activityData.activity || []);
      setError(systemResponse.ok ? null : systemData.error || sitesData.error || 'Docker Desktop agent is offline.');
    } catch {
      const message = 'The local control plane briefly lost its connection. Keep npm run dev open, then retry.';
      setSystem((current) => ({ ...current, connected: false, error: message }));
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => void refresh(true), sites.some((site) => site.status === 'Provisioning') ? 3000 : 10000);
    return () => window.clearInterval(interval);
  }, [refresh, sites]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = sites.find((site) => site.id === selectedId) || null;
  const visibleSites = useMemo(() => sites.filter((site) => {
    const searchMatch = `${site.name} ${site.domain} ${site.containerName}`.toLowerCase().includes(query.toLowerCase());
    const filterMatch = filter === 'All' || (filter === 'Running' ? site.status === 'Running' : site.status !== 'Running' || Boolean(site.error));
    return searchMatch && filterMatch;
  }), [filter, query, sites]);

  function navigate(next: View) { setView(next); setSelectedId(null); }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('create');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { site?: Site; error?: string };
      if (!response.ok || !result.site) throw new Error(result.error || 'The site could not be launched.');
      setLaunchOpen(false); setView('Sites'); setSelectedId(result.site.id);
      setToast(`${result.site.name} is provisioning in Docker Desktop.`);
      await refresh(true);
    } catch (failure) { setToast(failure instanceof Error ? failure.message : 'The site could not be launched.'); }
    finally { setBusy(null); }
  }

  async function operate(site: Site, type: string, options: Record<string, unknown> = {}) {
    if (type === 'delete' && !window.confirm(`Delete ${site.name}, its containers, volumes and local backups? This cannot be undone.`)) return;
    setBusy(`${site.id}:${type}`);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/operations`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, ...options }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `${type} failed.`);
      if (type === 'delete') setSelectedId(null);
      setToast(`${site.name}: ${operationLabel(type)} completed.`);
      await refresh(true);
    } catch (failure) { setToast(failure instanceof Error ? failure.message : `${type} failed.`); }
    finally { setBusy(null); }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('Overview')}><span className="brand-mark">G</span><span>GeekHeros</span></button>
      <div className="workspace-switcher static-workspace"><span className="workspace-avatar">DK</span><span className="workspace-copy"><strong>Docker Desktop</strong><small>{system.connected ? 'Local node connected' : 'Agent offline'}</small></span><span className={`connection-light ${system.connected ? 'online' : ''}`} /></div>
      <nav aria-label="Primary navigation"><p className="nav-label">Control plane</p>{nav.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-item ${view === item.view && !selected ? 'active' : ''}`}><span>{item.symbol}</span>{item.view}{item.view === 'Sites' && <em>{sites.length}</em>}</button>)}</nav>
      <div className="node-card"><div className="node-card-head"><span>Managed fleet</span><strong>{system.runningSites || 0}/{system.managedSites || 0}</strong></div><div className="capacity-track"><span style={{ width: `${system.managedSites ? Math.round(((system.runningSites || 0) / system.managedSites) * 100) : 0}%` }} /></div><small>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)} memory</small></div>
      <div className="sidebar-user"><span className="user-avatar">GH</span><span className="workspace-copy"><strong>Local administrator</strong><small>Docker access enabled</small></span></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><label className="global-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search containers and domains" /></label><div className={`top-actions ${system.connected ? '' : 'offline-copy'}`}><span className="live-dot" />{system.connected ? `Docker ${system.dockerVersion}` : 'Docker agent offline'}<button className="icon-button" onClick={() => void refresh()} aria-label="Refresh">↻</button></div></header>
      {error && <div className="connection-banner"><span>!</span><div><strong>Docker control is unavailable</strong><p>{error}</p></div><button onClick={() => void refresh()}>Retry connection</button></div>}
      {selected ? <SiteWorkspace site={selected} busy={busy} onBack={() => setSelectedId(null)} onOperate={operate} /> : <div className="page-content">
        {view === 'Overview' && <Overview sites={sites} system={system} activity={activity} onLaunch={() => setLaunchOpen(true)} onOpen={setSelectedId} />}
        {view === 'Sites' && <SitesView sites={visibleSites} total={sites.length} loading={loading} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onLaunch={() => setLaunchOpen(true)} onOpen={setSelectedId} />}
        {view === 'Activity' && <ActivityView entries={activity} />}
        {view === 'Settings' && <SettingsView system={system} />}
      </div>}
    </section>
    {launchOpen && <LaunchModal busy={busy === 'create'} onClose={() => setLaunchOpen(false)} onSubmit={createSite} />}
    {toast && <div className="toast" role="status"><span>✓</span>{toast}<button onClick={() => setToast(null)}>×</button></div>}
  </main>;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>; }
function MetricCard({ icon, tone, label, value, detail, meta = 'Live' }: { icon: string; tone: string; label: string; value: string; detail: string; meta?: string }) { return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><small>{label}</small><em>{meta}</em></div><strong>{value}</strong><p>{detail}</p></article>; }

function Overview({ sites, system, activity, onLaunch, onOpen }: { sites: Site[]; system: SystemInfo; activity: ActivityEntry[]; onLaunch: () => void; onOpen: (id: string) => void }) {
  const stopped = sites.filter((site) => site.status === 'Stopped').length;
  return <><PageHeading eyebrow="LOCAL INFRASTRUCTURE" title="Docker fleet" description="Live state from Docker Desktop—no seeded records or simulated operations." actions={<button className="primary-button" onClick={onLaunch}><span>＋</span>Launch WordPress</button>} />
    <div className="metric-grid"><MetricCard icon="●" tone="green" label="Running sites" value={String(system.runningSites || 0)} detail={`${system.managedSites || 0} managed site${system.managedSites === 1 ? '' : 's'}`} /><MetricCard icon="◴" tone="amber" label="Provisioning" value={String(system.provisioningSites || 0)} detail={`${stopped} stopped`} /><MetricCard icon="▤" tone="violet" label="Docker containers" value={String(system.runningContainers || 0)} detail={`${system.totalContainers || 0} total on this engine`} /><MetricCard icon="⌁" tone="blue" label="Host resources" value={`${system.cpuCount || 0} CPU`} detail={`${formatBytes(system.memoryBytes || 0)} available`} /></div>
    <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>RECENT SITES</small><h2>WordPress containers</h2></div></div>{sites.slice(0, 5).map((site) => <button className="compact-site" key={site.id} onClick={() => onOpen(site.id)}><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span><Status site={site} /><em>›</em></button>)}{!sites.length && <Empty title="No managed containers yet" copy="Launch your first WordPress site to create the fleet." />}</section><section className="content-card"><div className="card-title"><div><small>EDGE ROUTER</small><h2>Domain gateway</h2></div></div><div className="gateway-status"><span className={system.edge?.running ? 'gateway-on' : ''}>◎</span><strong>{system.edge?.running ? 'Routing active' : 'Not started'}</strong><p>{system.edge?.running ? 'Traefik is listening on ports 80 and 443. Site hostnames route to their WordPress containers.' : 'The router starts automatically with the first site.'}</p><code>{system.edge?.container || 'geekheros-edge'}</code></div></section></div>
    <section className="content-card activity-card"><div className="card-title"><div><small>REAL OPERATIONS</small><h2>Recent activity</h2></div></div><ActivityList entries={activity.slice(0, 6)} /></section></>;
}

function SitesView({ sites, total, loading, query, onQuery, filter, onFilter, onLaunch, onOpen }: { sites: Site[]; total: number; loading: boolean; query: string; onQuery: (value: string) => void; filter: Filter; onFilter: (value: Filter) => void; onLaunch: () => void; onOpen: (id: string) => void }) {
  const running = sites.filter((site) => site.status === 'Running').length;
  const attention = sites.filter((site) => site.status !== 'Running').length;
  return <><PageHeading eyebrow="DOCKER FLEET" title="Sites" description="Every row below maps to a real Docker WordPress container." actions={<button className="primary-button" onClick={onLaunch}><span>＋</span>Launch site</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon="●" tone="green" label="Running" value={String(running)} detail="Containers currently serving traffic" /><MetricCard icon="◴" tone="amber" label="Needs attention" value={String(attention)} detail="Stopped, provisioning or failed" /><MetricCard icon="↻" tone="violet" label="Updates found" value={String(sites.reduce((sum, site) => sum + site.updates, 0))} detail="From the latest live inventory scans" /><MetricCard icon="◫" tone="blue" label="Local backups" value={String(sites.reduce((sum, site) => sum + site.backupCount, 0))} detail="Stored outside the application source" /></div>
    <section className="fleet-panel"><div className="panel-toolbar"><div className="filter-tabs">{(['All', 'Running', 'Attention'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilter(item)}>{item}</button>)}</div><label className="table-search"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search sites" /></label></div><div className="site-table" role="table"><div className="site-row table-header"><span>Site</span><span>Status</span><span>Container</span><span>WordPress</span><span>Uptime</span><span /></div>{sites.map((site) => <button className="site-row" key={site.id} onClick={() => onOpen(site.id)}><div className="site-cell"><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span></div><Status site={site} /><span className="stacked"><strong>{site.containerName}</strong><small>{site.pod} · {site.image}</small></span><span className="stacked"><strong>{site.wp === '—' ? 'Installing' : `WP ${site.wp}`}</strong><small>PHP {site.php}</small></span><span className="uptime-cell"><strong>{site.uptime}</strong></span><span className="more-button">›</span></button>)}{!sites.length && <Empty title={loading ? 'Reading Docker Desktop…' : 'No WordPress sites yet'} copy={loading ? 'Live container state will appear here.' : 'Launch a site to create WordPress and MariaDB containers.'} />}</div><footer className="panel-footer"><span>Showing {sites.length} of {total} managed sites</span><span>Docker state refreshes automatically</span></footer></section></>;
}

function SiteWorkspace({ site, busy, onBack, onOperate }: { site: Site; busy: string | null; onBack: () => void; onOperate: (site: Site, type: string, options?: Record<string, unknown>) => void }) {
  const isBusy = Boolean(busy?.startsWith(site.id));
  const canOperate = !isBusy && site.status !== 'Provisioning';
  return <div className="site-workspace"><div className="site-hero"><button className="back-button" onClick={onBack}>← All sites</button><div className="site-hero-row"><div className="site-identity"><span className="large-site-avatar">{initials(site.name)}</span><div><div className="identity-title"><h1>{site.name}</h1><Status site={site} /></div><a href={site.siteUrl} target="_blank" rel="noreferrer">{site.domain} ↗</a></div></div><div className="site-actions">{site.status === 'Stopped' ? <button className="primary-button" disabled={!canOperate} onClick={() => onOperate(site, 'start')}><span>▶</span>Start</button> : <button className="secondary-button" disabled={!canOperate} onClick={() => onOperate(site, 'stop')}>Stop</button>}<button className="secondary-button" disabled={!canOperate} onClick={() => onOperate(site, 'restart')}>Restart</button>{site.status === 'Running' && <a className="primary-button link-button" href={site.adminUrl} target="_blank" rel="noreferrer">WP Admin ↗</a>}</div></div><div className="site-quick-meta"><span><small>WordPress</small><strong>{site.wp}</strong></span><span><small>PHP</small><strong>{site.php}</strong></span><span><small>Profile</small><strong>{site.pod}</strong></span><span><small>Container</small><strong>{site.containerId || 'Preparing'}</strong></span><span><small>Uptime</small><strong>{site.uptime}</strong></span></div></div>
    <div className="site-tab-content">{site.error && <div className="site-error"><span>!</span><div><strong>Last operation failed</strong><p>{site.error}</p></div></div>}{site.phase && <div className="provisioning-banner"><span className="spinner" /><div><strong>{site.phase}</strong><p>GeekHeros is applying the requested Docker state. This page refreshes automatically.</p></div></div>}<div className="metric-grid"><MetricCard icon="▦" tone="green" label="WordPress container" value={site.status} detail={site.containerName} /><MetricCard icon="▤" tone="violet" label="Database container" value="MariaDB" detail={site.databaseContainer} /><MetricCard icon="↻" tone="amber" label="Available updates" value={String(site.updates)} detail={site.lastScannedAt ? `Scanned ${relativeTime(site.lastScannedAt)}` : 'Run an inventory scan'} /><MetricCard icon="◫" tone="blue" label="Recovery points" value={String(site.backupCount)} detail={site.lastBackupAt ? `Last backup ${relativeTime(site.lastBackupAt)}` : 'No backups created'} /></div>
      <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>CONTAINER OPERATIONS</small><h2>Manage this site</h2></div></div><div className="operation-grid"><Operation icon="↻" title="Refresh inventory" copy="Read installed WordPress, PHP and update versions." disabled={!canOperate} onClick={() => onOperate(site, 'refresh')} /><Operation icon="◫" title="Create backup" copy="Export the database and archive the WordPress volume." disabled={!canOperate} onClick={() => onOperate(site, 'backup')} /><Operation icon="↑" title="Update WordPress" copy="Create a backup, then update core, plugins and themes." disabled={!canOperate} onClick={() => onOperate(site, 'update')} /><Operation icon="♢" title="Verify checksums" copy="Validate WordPress core and installed plugin files." disabled={!canOperate} onClick={() => onOperate(site, 'scan')} /></div></section><section className="content-card"><div className="card-title"><div><small>EDGE ROUTING</small><h2>Domain</h2></div></div><div className="domain-detail"><span>◎</span><strong>{site.domain}</strong><p>Point an A record at this Docker host. Traefik routes the hostname to the container over port 80.</p><a href={site.siteUrl} target="_blank" rel="noreferrer">Open site ↗</a>{site.directUrl && <code>{site.directUrl}</code>}</div></section></div>
      <section className="danger-zone"><div><strong>Remove site</strong><p>Deletes both containers, their named volumes, and local backups.</p></div><button disabled={!canOperate} onClick={() => onOperate(site, 'delete', { deleteData: true })}>Delete site and data</button></section></div></div>;
}

function Operation({ icon, title, copy, disabled, onClick }: { icon: string; title: string; copy: string; disabled: boolean; onClick: () => void }) { return <button className="operation-card" disabled={disabled} onClick={onClick}><span>{icon}</span><strong>{title}</strong><small>{copy}</small><em>Run operation →</em></button>; }
function ActivityView({ entries }: { entries: ActivityEntry[] }) { return <><PageHeading eyebrow="AUDIT LOG" title="Activity" description="Completed and failed operations reported by the local Docker agent." /><section className="content-card"><ActivityList entries={entries} /></section></>; }
function ActivityList({ entries }: { entries: ActivityEntry[] }) { if (!entries.length) return <Empty title="No operations recorded" copy="Container launches and lifecycle actions will appear here." />; return <div className="timeline live-timeline">{entries.map((entry) => <div key={entry.id}><span className={`activity-dot ${entry.state === 'failed' ? 'red' : 'green'}`} /><span><strong>{entry.message}</strong><small>{entry.siteName} · {entry.type}</small></span><time>{relativeTime(entry.createdAt)}</time></div>)}</div>; }

function SettingsView({ system }: { system: SystemInfo }) { return <><PageHeading eyebrow="LOCAL RUNTIME" title="Settings" description="The control plane is connected to your Docker Desktop engine through a loopback-only agent." /><div className="settings-layout"><aside className="settings-nav"><button className="selected">Docker connection</button><button disabled>HTTPS certificates</button><button disabled>Remote nodes</button></aside><section className="settings-main"><div className="settings-section"><div><h2>Docker engine</h2><p>Live details reported by the engine currently receiving control-plane operations.</p></div><div className="definition-grid"><span><small>Status</small><strong>{system.connected ? 'Connected' : 'Offline'}</strong></span><span><small>Version</small><strong>{system.dockerVersion || '—'}</strong></span><span><small>Operating system</small><strong>{system.operatingSystem || '—'}</strong></span><span><small>Resources</small><strong>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)}</strong></span><span><small>Agent</small><strong>{system.agent ? `${system.agent.host}:${system.agent.port}` : '—'}</strong></span><span><small>Edge gateway</small><strong>{system.edge?.running ? 'Running' : 'Starts with first site'}</strong></span></div></div><div className="settings-section"><div><h2>Domain routing</h2><p>Each site receives a Traefik host rule. Public domains need an A record pointing to this machine’s public IP, plus router/firewall forwarding for ports 80 and 443.</p></div><div className="setup-note"><span>i</span><p>Use a <code>.localhost</code> hostname for an immediate local test. Automated public TLS is not enabled until an ACME email and external port routing are configured.</p></div></div><div className="settings-section"><div><h2>Local startup</h2><p>Run <code>npm run dev</code> from the project folder. It starts the protected Docker agent and web interface together with a shared one-time token.</p></div></div></section></div></>; }

function LaunchModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><div className="modal-head"><div><p className="eyebrow">NEW DOCKER SITE</p><h2 id="launch-title">Launch WordPress</h2><p>Creates an isolated WordPress container, MariaDB companion, volumes, network and edge route.</p></div><button onClick={onClose} disabled={busy} aria-label="Close">×</button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Site name<input name="name" required maxLength={80} placeholder="Client marketing site" autoFocus /></label><label>Domain<input name="domain" required placeholder="client.localhost" /></label><label>Container profile<select name="pod" defaultValue="Standard"><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select></label><label>Administrator username<input name="adminUser" required defaultValue="admin" autoComplete="username" /></label><label className="full-field">Administrator email<input name="adminEmail" type="email" required placeholder="admin@example.com" autoComplete="email" /></label><label className="full-field">Administrator password<input name="adminPassword" type="password" required minLength={12} placeholder="At least 12 characters" autoComplete="new-password" /></label></div><div className="launch-footnote"><span>i</span><p>Passwords are used during installation and are not exposed in Docker labels or activity logs.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Starting containers…' : 'Launch site'}</button></div></form></section></div>; }

function Status({ site }: { site: Site }) { const tone = site.status.toLowerCase().replace(/[^a-z]+/g, '-'); return <span className={`status-pill ${tone}`}><i />{site.phase || site.status}</span>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty-state"><strong>{title}</strong><span>{copy}</span></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase(); }
function formatBytes(value: number) { if (!value) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function operationLabel(type: string) { return ({ start: 'start', stop: 'stop', restart: 'restart', refresh: 'inventory refresh', backup: 'backup', update: 'update', scan: 'checksum scan', delete: 'deletion' } as Record<string, string>)[type] || type; }
