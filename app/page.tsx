'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

type View = 'Overview' | 'Sites' | 'Updates' | 'Blueprints' | 'Backups' | 'Monitoring' | 'Security' | 'Clients' | 'Settings';
type Site = { id: string; name: string; domain: string; status: string; region: string; pod: string; wp: string; php: string; updates: number; uptime: string };
type Modal = null | 'launch' | 'connect' | 'domain';

const fallbackSites: Site[] = [
  { id: 'site_juniper', name: 'Juniper Studio', domain: 'juniper.studio', status: 'Running', region: 'US West', pod: 'Standard', wp: '6.8.2', php: '8.3', updates: 0, uptime: '100%' },
  { id: 'site_northstar', name: 'Northstar Legal', domain: 'northstarlegal.co', status: 'Running', region: 'US Central', pod: 'Performance', wp: '6.8.2', php: '8.3', updates: 3, uptime: '99.99%' },
  { id: 'site_paperpine', name: 'Paper & Pine', domain: 'paperandpine.shop', status: 'Running', region: 'Canada', pod: 'Standard', wp: '6.8.1', php: '8.2', updates: 7, uptime: '99.97%' },
  { id: 'site_kitehouse', name: 'Kitehouse', domain: 'kitehouse.design', status: 'Maintenance', region: 'Germany', pod: 'Micro', wp: '6.8.2', php: '8.3', updates: 1, uptime: '99.94%' },
  { id: 'site_arcwell', name: 'Arcwell Health', domain: 'arcwell.health', status: 'Running', region: 'US East', pod: 'Power', wp: '6.8.2', php: '8.3', updates: 0, uptime: '100%' },
];

const nav: Array<{ label?: string; items: Array<{ view: View; symbol: string; badge?: string }> }> = [
  { label: 'Control plane', items: [{ view: 'Overview', symbol: '⌂' }, { view: 'Sites', symbol: '▦', badge: '24' }, { view: 'Updates', symbol: '↻', badge: '11' }, { view: 'Blueprints', symbol: '◇' }] },
  { label: 'Site care', items: [{ view: 'Backups', symbol: '◫' }, { view: 'Monitoring', symbol: '⌁' }, { view: 'Security', symbol: '♢' }] },
  { label: 'Workspace', items: [{ view: 'Clients', symbol: '◎' }, { view: 'Settings', symbol: '⚙' }] },
];

const updates = [
  { name: 'Advanced Custom Fields', type: 'Plugin', current: '6.8.4', next: '6.8.8', sites: 9, risk: 'Recommended' },
  { name: 'Rank Math SEO', type: 'Plugin', current: '1.0.272', next: '1.0.277', sites: 6, risk: 'Recommended' },
  { name: 'WordPress Core', type: 'Core', current: '6.8.1', next: '6.8.2', sites: 2, risk: 'Security' },
  { name: 'Twenty Twenty-Five', type: 'Theme', current: '1.2', next: '1.3', sites: 4, risk: 'Routine' },
  { name: 'WPCode Lite', type: 'Plugin', current: '2.3.6', next: '2.3.8', sites: 3, risk: 'Routine' },
];

const activity = [
  ['Backup completed', 'Arcwell Health', '8 minutes ago', 'green'],
  ['Plugin inventory refreshed', 'Northstar Legal', '24 minutes ago', 'blue'],
  ['Uptime check recovered', 'Kitehouse', '2 hours ago', 'amber'],
  ['Deployment completed', 'Juniper Studio', 'Yesterday', 'violet'],
];

export default function Home() {
  const [sites, setSites] = useState<Site[]>(fallbackSites);
  const [view, setView] = useState<View>('Sites');
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [siteTab, setSiteTab] = useState('Overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | 'Running' | 'Attention'>('All');
  const [modal, setModal] = useState<Modal>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    fetch('/api/sites').then((response) => response.ok ? response.json() : Promise.reject()).then((data: { sites: Site[] }) => setSites(data.sites)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); }
      if (event.key === 'Escape') { setModal(null); setCommandOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleSites = useMemo(() => sites.filter((site) => {
    const matchesQuery = `${site.name} ${site.domain}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Running' ? site.status === 'Running' : site.updates > 0 || site.status !== 'Running');
    return matchesQuery && matchesFilter;
  }), [sites, query, filter]);

  function navigate(next: View) { setSelectedSite(null); setView(next); setSiteTab('Overview'); }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    const isExternal = data.get('kind') === 'external';
    const payload = {
      name: String(data.get('name') || ''), domain: String(data.get('domain') || ''),
      region: isExternal ? 'External' : String(data.get('region') || 'US West'),
      pod: isExternal ? 'External' : String(data.get('pod') || 'Standard'),
    };
    try {
      const response = await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { site?: Site; error?: string };
      if (!response.ok || !result.site) throw new Error(result.error || 'Unable to add site');
      setSites((current) => [result.site!, ...current]);
      setModal(null); setView('Sites'); setToast(`${result.site.name} was added to the deployment queue.`);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Unable to add site'); }
    finally { setSubmitting(false); }
  }

  async function queueOperation(site: Site, type: string, successMessage: string) {
    try {
      const response = await fetch(`/api/sites/${site.id}/operations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type }) });
      if (!response.ok) throw new Error();
      setToast(successMessage);
    } catch { setToast('The operation could not be queued.'); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('Overview')}><span className="brand-mark">G</span><span>GeekHeros</span></button>
        <button className="workspace-switcher">
          <span className="workspace-avatar">GH</span><span className="workspace-copy"><strong>GeekHeros</strong><small>Business workspace</small></span><span className="chevron">⌄</span>
        </button>
        <nav aria-label="Primary navigation">
          {nav.map((group) => <div key={group.label}>{group.label && <p className="nav-label">{group.label}</p>}{group.items.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-item ${view === item.view && !selectedSite ? 'active' : ''}`}><span>{item.symbol}</span>{item.view}{item.badge && (item.view === 'Updates' ? <b>{item.badge}</b> : <em>{item.badge}</em>)}</button>)}</div>)}
        </nav>
        <div className="node-card"><div className="node-card-head"><span>Node capacity</span><strong>68%</strong></div><div className="capacity-track"><span /></div><small>13.6 of 20 vCPU allocated</small></div>
        <button className="sidebar-user"><span className="user-avatar">MU</span><span className="workspace-copy"><strong>Mike Upton</strong><small>Administrator</small></span><span>•••</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="global-search" onClick={() => setCommandOpen(true)}><span>⌕</span><span>Search sites, clients, actions…</span></button>
          <div className="top-actions"><button className="icon-button" onClick={() => setCommandOpen(true)}>⌘ K</button><button className="icon-button" aria-label="Notifications" onClick={() => setToast('You are all caught up.')} >♢<i /></button><span className="live-dot" />All systems operational</div>
        </header>

        {selectedSite ? <SiteWorkspace site={selectedSite} activeTab={siteTab} onTab={setSiteTab} onBack={() => setSelectedSite(null)} onOperation={queueOperation} onToast={setToast} onDomain={() => setModal('domain')} /> : (
          <div className="page-content">
            {view === 'Sites' && <SitesView sites={visibleSites} total={sites.length} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onLaunch={() => setModal('launch')} onConnect={() => setModal('connect')} onSelect={setSelectedSite} />}
            {view === 'Overview' && <OverviewView onNavigate={navigate} onLaunch={() => setModal('launch')} />}
            {view === 'Updates' && <UpdatesView onToast={setToast} />}
            {view === 'Blueprints' && <BlueprintsView onToast={setToast} />}
            {view === 'Backups' && <BackupsView onToast={setToast} />}
            {view === 'Monitoring' && <MonitoringView />}
            {view === 'Security' && <SecurityView onToast={setToast} />}
            {view === 'Clients' && <ClientsView onToast={setToast} />}
            {view === 'Settings' && <SettingsView onToast={setToast} />}
          </div>
        )}
      </section>

      {(modal === 'launch' || modal === 'connect') && <SiteModal kind={modal} submitting={submitting} onClose={() => setModal(null)} onSubmit={createSite} />}
      {modal === 'domain' && <DomainModal onClose={() => setModal(null)} onSave={() => { setModal(null); setToast('Domain verification has been queued.'); }} />}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} onNavigate={(next) => { navigate(next); setCommandOpen(false); }} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}<button onClick={() => setToast(null)}>×</button></div>}
    </main>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function MetricCard({ icon, tone, label, value, detail, meta }: { icon: string; tone: string; label: string; value: string; detail: string; meta: string }) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><small>{label}</small><em>{meta}</em></div><strong>{value}</strong><p>{detail}</p></article>;
}

function SitesView({ sites, total, query, onQuery, filter, onFilter, onLaunch, onConnect, onSelect }: { sites: Site[]; total: number; query: string; onQuery: (value: string) => void; filter: 'All' | 'Running' | 'Attention'; onFilter: (value: 'All' | 'Running' | 'Attention') => void; onLaunch: () => void; onConnect: () => void; onSelect: (site: Site) => void }) {
  return <>
    <PageHeading eyebrow="HOSTING FLEET" title="Sites" description="Deploy, monitor and manage every WordPress site from one place." actions={<><button className="secondary-button" onClick={onConnect}>Connect existing</button><button className="primary-button" onClick={onLaunch}><span>＋</span>Launch site</button></>} />
    <div className="metric-grid"><MetricCard icon="●" tone="green" label="Live sites" value="24" detail="23 running · 1 maintenance" meta="+2 this month" /><MetricCard icon="↻" tone="amber" label="Available updates" value="11" detail="8 plugins · 2 themes · 1 core" meta="Across 3 sites" /><MetricCard icon="⌁" tone="violet" label="Fleet uptime" value="99.99%" detail="Every 3 minutes · 0 incidents" meta="Last 30 days" /><MetricCard icon="◫" tone="blue" label="Protected data" value="1.82 TB" detail="Last backup 8 minutes ago" meta="Encrypted" /></div>
    <section className="fleet-panel">
      <div className="panel-toolbar"><div className="filter-tabs" aria-label="Filter sites">{(['All', 'Running', 'Attention'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilter(item)}>{item}{item === 'Attention' && <span>3</span>}</button>)}</div><div className="toolbar-right"><label className="table-search"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} aria-label="Search sites" placeholder="Search sites" /></label><button className="square-button" aria-label="Filter table">≡</button><button className="square-button" aria-label="Choose columns">▥</button></div></div>
      <div className="site-table" role="table" aria-label="WordPress sites"><div className="site-row table-header" role="row"><span>Site</span><span>Status</span><span>Region / Pod</span><span>WordPress</span><span>Uptime</span><span /></div>{sites.map((site) => <button className="site-row" role="row" key={site.id} onClick={() => onSelect(site)}><div className="site-cell"><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span></div><span><span className={`status-pill ${site.status.toLowerCase()}`}><i />{site.status}</span></span><span className="stacked"><strong>{site.region}</strong><small>{site.pod} pod</small></span><span className="stacked"><strong>WP {site.wp}</strong>{site.updates ? <small className="needs-update">{site.updates} updates</small> : <small className="current">Current</small>}</span><span className="uptime-cell"><strong>{site.uptime}</strong><span className="sparkline">▁▂▂▃▄▃▅▅▆▆</span></span><span className="more-button">•••</span></button>)}{!sites.length && <div className="empty-state"><strong>No sites found</strong><span>Try another name or filter.</span></div>}</div>
      <footer className="panel-footer"><span>Showing {sites.length} of {total} sites</span><div><button disabled>‹</button><button className="current-page">1</button><button>2</button><button>3</button><button>›</button></div></footer>
    </section>
  </>;
}

function OverviewView({ onNavigate, onLaunch }: { onNavigate: (view: View) => void; onLaunch: () => void }) {
  return <><PageHeading eyebrow="GOOD MORNING, MIKE" title="Fleet overview" description="Your WordPress infrastructure is healthy and up to date." actions={<button className="primary-button" onClick={onLaunch}><span>＋</span>Launch site</button>} />
    <div className="metric-grid"><MetricCard icon="●" tone="green" label="Running sites" value="23" detail="1 site in maintenance" meta="Healthy" /><MetricCard icon="◈" tone="blue" label="Monthly usage" value="$142.60" detail="68% of forecast budget" meta="On track" /><MetricCard icon="⌁" tone="violet" label="Checks today" value="11,520" detail="No unresolved incidents" meta="100% passing" /><MetricCard icon="◫" tone="amber" label="Recovery points" value="384" detail="Across 24 sites" meta="Verified" /></div>
    <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>RESOURCE USAGE</small><h2>Node capacity</h2></div><button onClick={() => onNavigate('Settings')}>Manage nodes</button></div><div className="capacity-chart"><div className="ring"><span>68%</span><small>allocated</small></div><div className="capacity-legend"><p><i className="green-dot" />CPU<strong>13.6 / 20 vCPU</strong></p><p><i className="blue-dot" />Memory<strong>39.2 / 64 GB</strong></p><p><i className="amber-dot" />Storage<strong>428 / 800 GB</strong></p></div></div></section><section className="content-card"><div className="card-title"><div><small>CARE STATUS</small><h2>Needs attention</h2></div><button onClick={() => onNavigate('Updates')}>View all</button></div><div className="attention-list"><button onClick={() => onNavigate('Updates')}><span className="attention-icon amber">↻</span><span><strong>11 updates available</strong><small>Across three websites</small></span><em>›</em></button><button onClick={() => onNavigate('Security')}><span className="attention-icon red">♢</span><span><strong>1 security advisory</strong><small>Low severity · mitigated</small></span><em>›</em></button><button onClick={() => onNavigate('Backups')}><span className="attention-icon green">✓</span><span><strong>Backups current</strong><small>All policies passing</small></span><em>›</em></button></div></section></div>
    <section className="content-card activity-card"><div className="card-title"><div><small>LIVE OPERATIONS</small><h2>Recent activity</h2></div><button>Open activity log</button></div><div className="activity-list">{activity.map(([title, site, time, tone]) => <div key={title + site}><span className={`activity-dot ${tone}`} /><span><strong>{title}</strong><small>{site}</small></span><time>{time}</time></div>)}</div></section>
  </>;
}

function UpdatesView({ onToast }: { onToast: (message: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <><PageHeading eyebrow="WORDPRESS FLEET" title="Updates" description="Review and safely apply updates across every managed site." actions={<button className="primary-button" disabled={!selected.length} onClick={() => { onToast(`${selected.length} update${selected.length === 1 ? '' : 's'} queued with pre-update backups.`); setSelected([]); }}><span>↻</span>Update selected</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon="↻" tone="amber" label="Updates available" value="11" detail="Across 3 managed sites" meta="Review" /><MetricCard icon="♢" tone="red" label="Security updates" value="1" detail="No critical advisories" meta="Low risk" /><MetricCard icon="✓" tone="green" label="Current sites" value="21" detail="No action needed" meta="Healthy" /><MetricCard icon="◴" tone="blue" label="Last fleet scan" value="6m" detail="Inventory auto-refreshes" meta="Current" /></div>
    <section className="content-card table-card"><div className="card-title table-title"><div><small>AVAILABLE PACKAGES</small><h2>Update inventory</h2></div><label className="table-search"><span>⌕</span><input placeholder="Search packages" /></label></div><div className="package-table"><div className="package-row package-head"><span /><span>Package</span><span>Type</span><span>Version</span><span>Sites</span><span>Priority</span></div>{updates.map((item) => <label className="package-row" key={item.name}><input type="checkbox" checked={selected.includes(item.name)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.name] : current.filter((name) => name !== item.name))} /><span className="package-name"><i>{item.name[0]}</i><strong>{item.name}</strong></span><span>{item.type}</span><span className="version-change"><del>{item.current}</del><b>→</b><ins>{item.next}</ins></span><span>{item.sites} sites</span><span className={`priority ${item.risk.toLowerCase()}`}>{item.risk}</span></label>)}</div></section>
  </>;
}

function BlueprintsView({ onToast }: { onToast: (message: string) => void }) {
  const blueprints = [{ name: 'Agency Starter', description: 'Clean marketing stack with forms, SEO and caching.', sites: 8, size: '384 MB', wp: '6.8.2', tone: 'green' }, { name: 'Commerce Ready', description: 'WooCommerce, payments and performance defaults.', sites: 5, size: '612 MB', wp: '6.8.2', tone: 'violet' }, { name: 'Client Portal', description: 'Private membership foundation with secure defaults.', sites: 3, size: '428 MB', wp: '6.8.1', tone: 'blue' }];
  return <><PageHeading eyebrow="REUSABLE DEPLOYMENTS" title="Blueprints" description="Launch consistent WordPress builds from versioned site templates." actions={<button className="primary-button" onClick={() => onToast('Blueprint snapshot wizard opened in draft mode.')}><span>＋</span>Create blueprint</button>} /><div className="blueprint-grid">{blueprints.map((blueprint) => <article className="blueprint-card" key={blueprint.name}><div className={`blueprint-cover ${blueprint.tone}`}><span>◇</span><small>WORDPRESS BLUEPRINT</small></div><div className="blueprint-body"><div className="blueprint-title"><h2>{blueprint.name}</h2><button>•••</button></div><p>{blueprint.description}</p><div className="blueprint-meta"><span>WP {blueprint.wp}</span><span>{blueprint.size}</span><span>{blueprint.sites} launches</span></div><button className="secondary-button full-button" onClick={() => onToast(`${blueprint.name} selected for a new deployment.`)}>Launch from blueprint</button></div></article>)}</div></>;
}

function BackupsView({ onToast }: { onToast: (message: string) => void }) {
  const rows = [['Arcwell Health', '8 minutes ago', '18.4 GB', 'Vault + S3', 'Verified'], ['Juniper Studio', '1 hour ago', '4.8 GB', 'S3', 'Verified'], ['Northstar Legal', '2 hours ago', '9.2 GB', 'Vault + S3', 'Verified'], ['Paper & Pine', '5 hours ago', '12.1 GB', 'S3', 'Verified'], ['Kitehouse', 'Yesterday', '2.7 GB', 'Vault', 'Verified']];
  return <><PageHeading eyebrow="SITE CARE" title="Backups" description="Encrypted recovery points with policy-based retention and restore testing." actions={<><button className="secondary-button" onClick={() => onToast('Backup destination settings opened.')}>Destinations</button><button className="primary-button" onClick={() => onToast('A fleet backup has been queued.')}><span>＋</span>Create backup</button></>} /><div className="metric-grid compact-metrics"><MetricCard icon="✓" tone="green" label="Protected sites" value="24/24" detail="All policies passing" meta="Healthy" /><MetricCard icon="◫" tone="blue" label="Stored recovery points" value="384" detail="1.82 TB encrypted" meta="30-day retention" /><MetricCard icon="◴" tone="violet" label="Last restore test" value="2d" detail="Arcwell Health staging" meta="Passed" /><MetricCard icon="↗" tone="amber" label="Monthly transfer" value="620 GB" detail="41% of forecast" meta="On track" /></div><section className="content-card table-card"><div className="card-title table-title"><div><small>RECOVERY POINTS</small><h2>Recent backups</h2></div><div className="filter-tabs"><button className="selected">All</button><button>Manual</button><button>Scheduled</button></div></div><div className="backup-table"><div className="backup-row backup-head"><span>Site</span><span>Created</span><span>Size</span><span>Destination</span><span>Status</span><span /></div>{rows.map((row) => <div className="backup-row" key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><span>{row[2]}</span><span>{row[3]}</span><span className="verified">✓ {row[4]}</span><button onClick={() => onToast(`Recovery options opened for ${row[0]}.`)}>•••</button></div>)}</div></section></>;
}

function MonitoringView() {
  const monitors = [{ site: 'Juniper Studio', uptime: '100%', latency: '182 ms', region: 'Sydney', status: 'Operational' }, { site: 'Northstar Legal', uptime: '99.99%', latency: '94 ms', region: 'Virginia', status: 'Operational' }, { site: 'Paper & Pine', uptime: '99.97%', latency: '216 ms', region: 'Toronto', status: 'Operational' }, { site: 'Kitehouse', uptime: '99.94%', latency: '128 ms', region: 'Frankfurt', status: 'Recovered' }];
  return <><PageHeading eyebrow="OBSERVABILITY" title="Monitoring" description="Uptime, response performance and Lighthouse trends across the fleet." actions={<button className="primary-button"><span>＋</span>Add monitor</button>} /><div className="metric-grid"><MetricCard icon="⌁" tone="green" label="Fleet uptime" value="99.99%" detail="Last 30 days" meta="SLA healthy" /><MetricCard icon="◴" tone="blue" label="Median response" value="148 ms" detail="Across all regions" meta="−12 ms" /><MetricCard icon="◈" tone="violet" label="Performance score" value="92" detail="Median Lighthouse" meta="+3 points" /><MetricCard icon="!" tone="amber" label="Open incidents" value="0" detail="Last incident 6 days ago" meta="Clear" /></div><div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>30-DAY TREND</small><h2>Global response time</h2></div><div className="filter-tabs"><button>7D</button><button className="selected">30D</button><button>90D</button></div></div><div className="line-chart"><div className="chart-grid" />{[35,42,38,50,46,58,55,64,59,66,62,70,67,72,69,76,73,79,75,82,78,84,80,86,83,88,85,90,87,92].map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div><div className="chart-axis"><span>Jul 28</span><span>Aug 6</span><span>Aug 16</span><span>Today</span></div></section><section className="content-card"><div className="card-title"><div><small>LIGHTHOUSE</small><h2>Core Web Vitals</h2></div></div><div className="vitals"><div><span className="score-ring good">92</span><strong>Performance</strong><small>Good</small></div><div><span className="score-ring good">98</span><strong>Accessibility</strong><small>Good</small></div><div><span className="score-ring fair">87</span><strong>SEO</strong><small>Review</small></div></div></section></div><section className="content-card table-card"><div className="card-title table-title"><div><small>ACTIVE CHECKS</small><h2>Site monitors</h2></div></div><div className="monitor-table">{monitors.map((monitor) => <div key={monitor.site}><span className="site-avatar">{initials(monitor.site)}</span><strong>{monitor.site}</strong><span>{monitor.uptime}<small>30-day uptime</small></span><span>{monitor.latency}<small>Response</small></span><span>{monitor.region}<small>Probe</small></span><span className="verified">● {monitor.status}</span><button>•••</button></div>)}</div></section></>;
}

function SecurityView({ onToast }: { onToast: (message: string) => void }) {
  return <><PageHeading eyebrow="SECURITY CENTER" title="Security" description="Vulnerability intelligence, integrity checks and protection status." actions={<button className="primary-button" onClick={() => onToast('A fleet-wide security scan has been queued.')}><span>♢</span>Run fleet scan</button>} /><div className="metric-grid"><MetricCard icon="✓" tone="green" label="Protected sites" value="24" detail="WAF and isolation enabled" meta="100%" /><MetricCard icon="♢" tone="amber" label="Open findings" value="1" detail="Low severity · mitigated" meta="Review" /><MetricCard icon="▥" tone="blue" label="Files verified" value="284k" detail="Last integrity scan" meta="4 hours ago" /><MetricCard icon="⊘" tone="violet" label="Blocked requests" value="18.2k" detail="Last 7 days" meta="+8%" /></div><div className="security-banner"><span className="security-shield">♢</span><div><strong>Fleet protection is active</strong><p>All sites are isolated, backed by managed firewall rules and checked against current vulnerability intelligence.</p></div><span className="security-score">96<small>/100</small></span></div><section className="content-card table-card"><div className="card-title table-title"><div><small>OPEN FINDINGS</small><h2>Vulnerability report</h2></div><button>Scan history</button></div><div className="finding-row"><span className="priority routine">Low</span><span><strong>Outdated plugin with advisory</strong><small>WPCode Lite · Northstar Legal</small></span><span><strong>Mitigated</strong><small>WAF rule applied</small></span><button className="secondary-button" onClick={() => onToast('Finding details opened.')}>Review finding</button></div></section></>;
}

function ClientsView({ onToast }: { onToast: (message: string) => void }) {
  const clients = [{ name: 'Northstar Legal Group', contact: 'Elena Torres', email: 'elena@northstarlegal.co', sites: 3, care: 'Plus' }, { name: 'Paper & Pine Co.', contact: 'Nora Bell', email: 'nora@paperandpine.shop', sites: 2, care: 'Plus' }, { name: 'Arcwell Health', contact: 'Sam Kim', email: 'sam@arcwell.health', sites: 4, care: 'Custom' }, { name: 'Kitehouse Studio', contact: 'Theo Grant', email: 'theo@kitehouse.design', sites: 1, care: 'Basic' }];
  return <><PageHeading eyebrow="CLIENT OPERATIONS" title="Clients" description="Organize sites, service levels, access and reports by client." actions={<button className="primary-button" onClick={() => onToast('New client form opened in draft mode.')}><span>＋</span>Add client</button>} /><div className="client-grid">{clients.map((client) => <article className="client-card" key={client.name}><div className="client-card-top"><span className="client-avatar">{initials(client.name)}</span><button>•••</button></div><h2>{client.name}</h2><p>{client.contact} · {client.email}</p><div className="client-stats"><span><strong>{client.sites}</strong><small>Sites</small></span><span><strong>{client.care}</strong><small>Care plan</small></span><span><strong>Current</strong><small>Reports</small></span></div><button className="secondary-button full-button" onClick={() => onToast(`${client.name} workspace opened.`)}>Open client</button></article>)}</div></>;
}

function SettingsView({ onToast }: { onToast: (message: string) => void }) {
  const [slack, setSlack] = useState(true); const [backups, setBackups] = useState(true); const [security, setSecurity] = useState(true);
  return <><PageHeading eyebrow="WORKSPACE" title="Settings" description="Infrastructure defaults, notifications and team access." actions={<button className="primary-button" onClick={() => onToast('Workspace settings saved.')}><span>✓</span>Save changes</button>} /><div className="settings-layout"><aside className="settings-nav"><button className="selected">Workspace</button><button>Deployment defaults</button><button>Backup policy</button><button>Notifications</button><button>Team & access</button><button>API tokens</button></aside><section className="settings-main"><div className="settings-section"><div><h2>Workspace profile</h2><p>Used throughout reports and operational notifications.</p></div><div className="form-grid"><label>Workspace name<input defaultValue="GeekHeros" /></label><label>Business URL<input defaultValue="https://geekheros.com" /></label><label className="full-field">Default deployment domain<input defaultValue="sites.geekheros.com" /></label></div></div><div className="settings-section"><div><h2>Operational defaults</h2><p>Applied to newly deployed sites.</p></div><div className="setting-toggle"><span><strong>Encrypted scheduled backups</strong><small>Daily backup to configured S3-compatible storage.</small></span><button className={`switch ${backups ? 'on' : ''}`} onClick={() => setBackups(!backups)}><i /></button></div><div className="setting-toggle"><span><strong>Automated security scans</strong><small>Check inventory and file integrity every 12 hours.</small></span><button className={`switch ${security ? 'on' : ''}`} onClick={() => setSecurity(!security)}><i /></button></div><div className="setting-toggle"><span><strong>Slack operation alerts</strong><small>Send failures and recoveries to the operations channel.</small></span><button className={`switch ${slack ? 'on' : ''}`} onClick={() => setSlack(!slack)}><i /></button></div></div></section></div></>;
}

function SiteWorkspace({ site, activeTab, onTab, onBack, onOperation, onToast, onDomain }: { site: Site; activeTab: string; onTab: (tab: string) => void; onBack: () => void; onOperation: (site: Site, type: string, message: string) => void; onToast: (message: string) => void; onDomain: () => void }) {
  const tabs = ['Overview', 'WordPress', 'Domains', 'Developer', 'Backups', 'Monitoring', 'Activity'];
  return <div className="site-workspace"><div className="site-hero"><button className="back-button" onClick={onBack}>← All sites</button><div className="site-hero-row"><div className="site-identity"><span className="large-site-avatar">{initials(site.name)}</span><div><div className="identity-title"><h1>{site.name}</h1><span className={`status-pill ${site.status.toLowerCase()}`}><i />{site.status}</span></div><a href={`https://${site.domain}`} target="_blank" rel="noreferrer">{site.domain} ↗</a></div></div><div className="site-actions"><button className="secondary-button" onClick={() => onOperation(site, 'site.backup', `Backup queued for ${site.name}.`)}>◫ Backup</button><button className="secondary-button" onClick={() => onOperation(site, 'site.restart', `Restart queued for ${site.name}.`)}>↻ Restart</button><button className="primary-button" onClick={() => onToast('Site action menu opened.')}><span>•••</span>Actions</button></div></div><div className="site-quick-meta"><span><small>Pod</small><strong>{site.pod}</strong></span><span><small>Region</small><strong>{site.region}</strong></span><span><small>WordPress</small><strong>{site.wp}</strong></span><span><small>PHP</small><strong>{site.php}</strong></span><span><small>Uptime</small><strong>{site.uptime}</strong></span></div></div><div className="site-tabs">{tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'selected' : ''} onClick={() => onTab(tab)}>{tab}{tab === 'WordPress' && site.updates > 0 && <span>{site.updates}</span>}</button>)}</div><div className="site-tab-content">{activeTab === 'Overview' && <SiteOverview site={site} onTab={onTab} />}{activeTab === 'WordPress' && <SiteWordPress site={site} onToast={onToast} />}{activeTab === 'Domains' && <SiteDomains site={site} onDomain={onDomain} />}{activeTab === 'Developer' && <SiteDeveloper onToast={onToast} />}{activeTab === 'Backups' && <SiteBackups site={site} onOperation={onOperation} />}{activeTab === 'Monitoring' && <SiteMonitoring />}{activeTab === 'Activity' && <SiteActivity />}</div></div>;
}

function SiteOverview({ site, onTab }: { site: Site; onTab: (tab: string) => void }) { return <><div className="metric-grid"><MetricCard icon="✓" tone="green" label="Core status" value="Current" detail={`WordPress ${site.wp}`} meta="Healthy" /><MetricCard icon="↻" tone="amber" label="Updates" value={String(site.updates)} detail="Plugins and themes" meta={site.updates ? 'Review' : 'Current'} /><MetricCard icon="⌁" tone="violet" label="30-day uptime" value={site.uptime} detail="Checked every 3 minutes" meta="SLA" /><MetricCard icon="◫" tone="blue" label="Last backup" value="8m" detail="Encrypted · verified" meta="Current" /></div><div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>PERFORMANCE</small><h2>Site health</h2></div><button onClick={() => onTab('Monitoring')}>Open monitoring</button></div><div className="health-grid"><div><span className="score-ring good">94</span><strong>Performance</strong><small>Lighthouse desktop</small></div><div><span className="score-ring good">100</span><strong>SSL</strong><small>Renews automatically</small></div><div><span className="score-ring good">98</span><strong>Security</strong><small>No critical findings</small></div><div><span className="score-ring fair">87</span><strong>SEO</strong><small>2 recommendations</small></div></div></section><section className="content-card"><div className="card-title"><div><small>RUNTIME</small><h2>Resource usage</h2></div></div><div className="resource-bars"><p><span>CPU</span><strong>24%</strong></p><div><i style={{ width: '24%' }} /></div><p><span>Memory</span><strong>58%</strong></p><div><i style={{ width: '58%' }} /></div><p><span>Storage</span><strong>41%</strong></p><div><i style={{ width: '41%' }} /></div></div></section></div><section className="content-card"><div className="card-title"><div><small>LATEST OPERATIONS</small><h2>Activity</h2></div><button onClick={() => onTab('Activity')}>View all</button></div><div className="activity-list compact">{activity.slice(0, 3).map(([title, _, time, tone]) => <div key={title}><span className={`activity-dot ${tone}`} /><span><strong>{title}</strong><small>Operation completed successfully</small></span><time>{time}</time></div>)}</div></section></>; }

function SiteWordPress({ site, onToast }: { site: Site; onToast: (message: string) => void }) { const packages = [['Advanced Custom Fields', 'Plugin', 'Active', '6.8.4', '6.8.8'], ['Rank Math SEO', 'Plugin', 'Active', '1.0.272', '1.0.277'], ['WPCode Lite', 'Plugin', 'Active', '2.3.8', 'Current'], ['Twenty Twenty-Five', 'Theme', 'Inactive', '1.3', 'Current']]; return <section className="content-card table-card"><div className="card-title table-title"><div><small>WORDPRESS {site.wp}</small><h2>Plugins & themes</h2></div><div className="heading-actions"><button className="secondary-button" onClick={() => onToast('Package installer opened.')}>Install package</button><button className="primary-button" onClick={() => onToast('Safe update queued with a restore point.')}><span>↻</span>Update all</button></div></div><div className="wp-table"><div className="wp-row wp-head"><span>Package</span><span>Type</span><span>Status</span><span>Installed</span><span>Available</span><span /></div>{packages.map((row) => <div className="wp-row" key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><span className={row[2] === 'Active' ? 'verified' : ''}>{row[2]}</span><span>{row[3]}</span><span className={row[4] === 'Current' ? 'verified' : 'needs-update'}>{row[4]}</span><button>•••</button></div>)}</div></section>; }

function SiteDomains({ site, onDomain }: { site: Site; onDomain: () => void }) { return <section className="content-card table-card"><div className="card-title table-title"><div><small>EDGE ROUTING</small><h2>Connected domains</h2></div><button className="primary-button" onClick={onDomain}><span>＋</span>Connect domain</button></div><div className="domain-row"><span className="domain-icon">◎</span><span><strong>{site.domain}</strong><small>Primary domain</small></span><span><strong>A record verified</strong><small>Routing active</small></span><span className="verified">✓ SSL valid</span><button>•••</button></div><div className="dns-note"><span>i</span><p><strong>Point domains to your edge address.</strong> GeekHeros verifies DNS ownership before routing traffic and issuing a certificate.</p></div></section>; }

function SiteDeveloper({ onToast }: { onToast: (message: string) => void }) { const tools = [['SFTP & SSH', 'Secure file and command-line access', '↗'], ['Database manager', 'Open an isolated Adminer session', '▤'], ['Log viewer', 'Stream NGINX, PHP and WordPress logs', '≡'], ['WP-CLI', 'Run audited WordPress commands', '>_'], ['Code editor', 'Edit site files in a scoped browser session', '{}'], ['Web server', 'PHP version, service controls and permissions', '⚙']]; return <div className="tool-grid">{tools.map((tool) => <button className="tool-card" key={tool[0]} onClick={() => onToast(`${tool[0]} access session prepared.`)}><span>{tool[2]}</span><strong>{tool[0]}</strong><small>{tool[1]}</small><em>Open tool →</em></button>)}</div>; }

function SiteBackups({ site, onOperation }: { site: Site; onOperation: (site: Site, type: string, message: string) => void }) { return <section className="content-card table-card"><div className="card-title table-title"><div><small>RECOVERY</small><h2>Backup history</h2></div><button className="primary-button" onClick={() => onOperation(site, 'site.backup', `Backup queued for ${site.name}.`)}><span>＋</span>Create backup</button></div><div className="backup-table">{[['Today, 11:02 AM', 'Incremental', '4.8 GB', 'Verified'], ['Yesterday, 11:01 AM', 'Incremental', '4.7 GB', 'Verified'], ['Aug 25, 11:00 AM', 'Full', '12.4 GB', 'Verified']].map((row) => <div className="backup-row" key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><span>{row[2]}</span><span>S3 + Vault</span><span className="verified">✓ {row[3]}</span><button>•••</button></div>)}</div></section>; }

function SiteMonitoring() { return <><div className="metric-grid"><MetricCard icon="⌁" tone="green" label="30-day uptime" value="99.99%" detail="0 unresolved incidents" meta="Healthy" /><MetricCard icon="◴" tone="blue" label="Response time" value="132 ms" detail="Global median" meta="−18 ms" /><MetricCard icon="◈" tone="violet" label="Lighthouse" value="94" detail="Desktop performance" meta="+2" /><MetricCard icon="↗" tone="amber" label="Page size" value="1.8 MB" detail="Down 240 KB" meta="Improved" /></div><section className="content-card"><div className="card-title"><div><small>UPTIME HISTORY</small><h2>Last 30 days</h2></div></div><div className="uptime-days">{Array.from({ length: 30 }, (_, index) => <i key={index} className={index === 18 ? 'warn' : ''} />)}</div><div className="uptime-legend"><span>30 days ago</span><strong>99.99% available</strong><span>Today</span></div></section></>; }

function SiteActivity() { return <section className="content-card"><div className="card-title"><div><small>IMMUTABLE EVENT LOG</small><h2>Operation activity</h2></div><label className="table-search"><span>⌕</span><input placeholder="Search activity" /></label></div><div className="timeline">{[...activity, ['Security scan completed', 'No vulnerabilities found', '2 days ago', 'green']].map(([title, detail, time, tone]) => <div key={title + time}><span className={`activity-dot ${tone}`} /><span><strong>{title}</strong><small>{detail}</small></span><time>{time}</time></div>)}</div></section>; }

function SiteModal({ kind, submitting, onClose, onSubmit }: { kind: 'launch' | 'connect'; submitting: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const external = kind === 'connect'; return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="site-modal-title"><div className="modal-head"><div><p className="eyebrow">{external ? 'EXTERNAL WORDPRESS' : 'NEW DEPLOYMENT'}</p><h2 id="site-modal-title">{external ? 'Connect an existing site' : 'Launch a WordPress site'}</h2><p>{external ? 'Install the connector to manage updates and care services.' : 'Provision an isolated, production-ready WordPress pod.'}</p></div><button onClick={onClose} aria-label="Close">×</button></div><form onSubmit={onSubmit}><input type="hidden" name="kind" value={external ? 'external' : 'hosted'} /><div className="form-grid"><label>Site name<input name="name" required placeholder="Acme Marketing" autoFocus /></label><label>Domain<input name="domain" required placeholder="acme.example.com" /></label>{!external && <><label>Region<select name="region" defaultValue="US West"><option>US West</option><option>US Central</option><option>US East</option><option>Canada</option><option>Germany</option><option>Australia</option></select></label><label>Pod profile<select name="pod" defaultValue="Standard"><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select></label></>}{external && <div className="connector-box full-field"><span>◇</span><div><strong>GeekHeros Connector</strong><p>A signed management agent will inventory this site after it is connected.</p></div><em>platform.zip</em></div>}</div><div className="modal-summary"><span>✓</span><p><strong>{external ? 'No hosting changes' : 'Includes automated TLS and daily backups'}</strong><small>{external ? 'The current host and domain remain unchanged.' : 'You can resize or move the site later.'}</small></p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? 'Adding…' : external ? 'Connect site' : 'Launch site'}</button></div></form></section></div>; }

function DomainModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) { return <div className="modal-backdrop"><section className="modal small-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">EDGE ROUTING</p><h2>Connect domain</h2><p>Point the domain at your node, then GeekHeros will verify and issue SSL.</p></div><button onClick={onClose}>×</button></div><div className="form-grid"><label className="full-field">Domain name<input placeholder="www.example.com" autoFocus /></label></div><div className="dns-target"><span>A</span><strong>@</strong><code>203.0.113.42</code><button>Copy</button></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onSave}>Verify domain</button></div></section></div>; }

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: View) => void }) { const commands: Array<[View, string, string]> = [['Sites', 'Open site fleet', '▦'], ['Updates', 'Review WordPress updates', '↻'], ['Backups', 'Browse recovery points', '◫'], ['Monitoring', 'Open uptime monitoring', '⌁'], ['Security', 'Open security center', '♢'], ['Clients', 'Browse clients', '◎']]; return <div className="modal-backdrop command-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="command-palette" role="dialog" aria-modal="true"><label><span>⌕</span><input placeholder="Search sites, clients, actions…" autoFocus /><kbd>ESC</kbd></label><small>QUICK NAVIGATION</small>{commands.map(([view, label, symbol]) => <button key={view} onClick={() => onNavigate(view)}><span>{symbol}</span><strong>{label}</strong><kbd>↵</kbd></button>)}</section></div>; }

function initials(value: string) { return value.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase(); }
