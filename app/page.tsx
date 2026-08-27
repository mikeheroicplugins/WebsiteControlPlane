'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArchiveRestore, ArrowLeft, ArrowRight, Boxes, Check, ChevronRight, CircleAlert,
  CirclePlay, Container, Database, ExternalLink, Globe2, House, Info, LogIn, Package,
  Play, Plus, RefreshCw, RotateCw, Search, Settings, ShieldCheck, Square, Upload, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type View = 'Overview' | 'Sites' | 'Clients' | 'Activity' | 'Settings';
type Filter = 'All' | 'Running' | 'Attention';
type SiteTab = 'Overview' | 'Updates' | 'Backups' | 'Tools';

type UpdateCounts = { core: number; plugins: number; themes: number };
type Site = {
  id: string; name: string; domain: string; status: string; phase: string | null; error: string | null;
  clientId: string | null; tags: string[]; region: string; pod: string; wp: string; php: string;
  updates: number; updateCounts: UpdateCounts; uptime: string; createdAt: string; updatedAt: string;
  containerId: string | null; containerName: string; databaseContainer: string; image: string;
  directUrl: string | null; siteUrl: string; adminUrl: string; backupCount: number;
  lastBackupAt: string | null; lastScannedAt: string | null;
};
type Client = {
  id: string; name: string; company: string; email: string; phone: string; notes: string;
  siteCount: number; runningSiteCount: number; createdAt: string; updatedAt: string;
};
type PackageItem = {
  name: string; status: string; version: string; update: string; updateVersion: string | null; autoUpdate: string;
};
type Backup = { id: string; createdAt: string; files: string[] };
type Inventory = {
  readAt: string; core: { version: string; update: { version: string; updateType: string } | null };
  plugins: PackageItem[]; themes: PackageItem[]; updates: UpdateCounts; backups: Backup[];
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
type LoginResponse = { actionUrl: string; action: string; token: string; expiresAt: string };

const nav: Array<{ view: View; icon: LucideIcon }> = [
  { view: 'Overview', icon: House }, { view: 'Sites', icon: Container }, { view: 'Clients', icon: Users },
  { view: 'Activity', icon: Activity }, { view: 'Settings', icon: Settings },
];

export default function Home() {
  const [view, setView] = useState<View>('Sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [system, setSystem] = useState<SystemInfo>({ connected: false });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [launchOpen, setLaunchOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [systemResponse, sitesResponse, clientsResponse, activityResponse] = await Promise.all([
        fetch('/api/system', { cache: 'no-store' }), fetch('/api/sites', { cache: 'no-store' }),
        fetch('/api/clients', { cache: 'no-store' }), fetch('/api/activity', { cache: 'no-store' }),
      ]);
      const [systemData, sitesData, clientsData, activityData] = await Promise.all([
        systemResponse.json().catch(() => ({ connected: false, error: 'Unable to read Docker status.' })),
        sitesResponse.json().catch(() => ({ sites: [] })), clientsResponse.json().catch(() => ({ clients: [] })),
        activityResponse.json().catch(() => ({ activity: [] })),
      ]) as [SystemInfo, { sites?: Site[]; error?: string }, { clients?: Client[] }, { activity?: ActivityEntry[] }];
      setSystem(systemData);
      if (sitesResponse.ok) setSites(sitesData.sites || []);
      if (clientsResponse.ok) setClients(clientsData.clients || []);
      if (activityResponse.ok) setActivity(activityData.activity || []);
      setError(systemResponse.ok ? null : systemData.error || sitesData.error || 'Docker Desktop agent is offline.');
    } catch {
      const message = 'The local control plane briefly lost its connection. Keep npm run dev open, then retry.';
      setSystem((current) => ({ ...current, connected: false, error: message }));
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);
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
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const visibleSites = useMemo(() => sites.filter((site) => {
    const searchMatch = `${site.name} ${site.domain} ${site.containerName} ${site.tags.join(' ')} ${site.clientId ? clientNames.get(site.clientId) || '' : ''}`.toLowerCase().includes(query.toLowerCase());
    const filterMatch = filter === 'All' || (filter === 'Running' ? site.status === 'Running' : site.status !== 'Running' || Boolean(site.error));
    return searchMatch && filterMatch;
  }), [clientNames, filter, query, sites]);
  const visibleClients = useMemo(() => clients.filter((client) => `${client.name} ${client.company} ${client.email} ${client.phone}`.toLowerCase().includes(query.toLowerCase())), [clients, query]);

  function navigate(next: View) { setView(next); setSelectedId(null); }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('create');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { site?: Site; error?: string };
      if (!response.ok || !result.site) throw new Error(result.error || 'The site could not be launched.');
      setLaunchOpen(false); setView('Sites'); setSelectedId(result.site.id);
      setToast(`${result.site.name} is provisioning in Docker Desktop.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The site could not be launched.')); }
    finally { setBusy(null); }
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('client:save');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const endpoint = editingClient ? `/api/clients/${encodeURIComponent(editingClient.id)}` : '/api/clients';
      const response = await fetch(endpoint, { method: editingClient ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { client?: Client; error?: string };
      if (!response.ok || !result.client) throw new Error(result.error || 'The client could not be saved.');
      setClientOpen(false); setEditingClient(null); setToast(`${result.client.name} was saved.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The client could not be saved.')); }
    finally { setBusy(null); }
  }

  async function deleteClient(client: Client) {
    if (!window.confirm(`Remove ${client.name}? Assigned sites will be kept and become unassigned.`)) return;
    setBusy(`client:${client.id}:delete`);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The client could not be removed.');
      setToast(`${client.name} was removed. Sites were kept.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The client could not be removed.')); }
    finally { setBusy(null); }
  }

  async function operate(site: Site, type: string, options: Record<string, unknown> = {}) {
    if (type === 'delete' && !window.confirm(`Delete ${site.name}, its containers, volumes and local backups? This cannot be undone.`)) return false;
    setBusy(`${site.id}:${type}`);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/operations`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, ...options }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `${type} failed.`);
      if (type === 'delete') setSelectedId(null);
      setToast(`${site.name}: ${operationLabel(type)} completed.`); await refresh(true); return true;
    } catch (failure) { setToast(messageFrom(failure, `${type} failed.`)); return false; }
    finally { setBusy(null); }
  }

  async function saveMetadata(site: Site, clientId: string | null, tags: string[]) {
    setBusy(`${site.id}:metadata`);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, tags }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Site details could not be saved.');
      setToast(`${site.name}: client and tags saved.`); await refresh(true); return true;
    } catch (failure) { setToast(messageFrom(failure, 'Site details could not be saved.')); return false; }
    finally { setBusy(null); }
  }

  async function oneClickLogin(site: Site) {
    const windowName = `geekheros_admin_${Date.now()}`;
    const popup = window.open('about:blank', windowName);
    if (!popup) { setToast('Allow pop-ups for this control plane, then try again.'); return; }
    popup.opener = null;
    popup.document.title = 'Opening WordPress Admin';
    popup.document.body.textContent = 'Preparing a secure, one-time WordPress login…';
    setBusy(`${site.id}:login`);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/login`, { method: 'POST' });
      const result = await response.json() as { login?: LoginResponse; error?: string };
      if (!response.ok || !result.login) throw new Error(result.error || 'WP Admin login could not be created.');
      const form = document.createElement('form');
      form.method = 'POST'; form.action = result.login.actionUrl; form.target = windowName;
      for (const [name, value] of [['action', result.login.action], ['geekheros_token', result.login.token]]) {
        const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
      }
      document.body.append(form); form.submit(); form.remove();
      setToast(`${site.name}: opening WP Admin with a one-time session.`);
    } catch (failure) { popup.close(); setToast(messageFrom(failure, 'WP Admin login could not be created.')); }
    finally { setBusy(null); }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('Overview')}><span className="brand-mark">G</span><span>GeekHeros</span></button>
      <div className="workspace-switcher static-workspace"><span className="workspace-avatar">DK</span><span className="workspace-copy"><strong>Docker Desktop</strong><small>{system.connected ? 'Local node connected' : 'Agent offline'}</small></span><span className={`connection-light ${system.connected ? 'online' : ''}`} /></div>
      <nav aria-label="Primary navigation"><p className="nav-label">Control plane</p>{nav.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-item ${view === item.view && !selected ? 'active' : ''}`}><span><item.icon aria-hidden="true" /></span>{item.view}{item.view === 'Sites' && <em>{sites.length}</em>}{item.view === 'Clients' && <em>{clients.length}</em>}</button>)}</nav>
      <div className="node-card"><div className="node-card-head"><span>Managed fleet</span><strong>{system.runningSites || 0}/{system.managedSites || 0}</strong></div><div className="capacity-track"><span style={{ width: `${system.managedSites ? Math.round(((system.runningSites || 0) / system.managedSites) * 100) : 0}%` }} /></div><small>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)} memory</small></div>
      <div className="sidebar-user"><span className="user-avatar">GH</span><span className="workspace-copy"><strong>Local administrator</strong><small>Docker access enabled</small></span></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><label className="global-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sites, clients and tags" /></label><div className={`top-actions ${system.connected ? '' : 'offline-copy'}`}><span className="live-dot" />{system.connected ? `Docker ${system.dockerVersion}` : 'Docker agent offline'}<button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw aria-hidden="true" /></button></div></header>
      {error && <div className="connection-banner"><span><CircleAlert aria-hidden="true" /></span><div><strong>Docker control is unavailable</strong><p>{error}</p></div><button onClick={() => void refresh()}>Retry connection</button></div>}
      {selected ? <SiteWorkspace key={selected.id} site={selected} clients={clients} busy={busy} onBack={() => setSelectedId(null)} onOperate={operate} onSaveMetadata={saveMetadata} onLogin={oneClickLogin} /> : <div className="page-content">
        {view === 'Overview' && <Overview sites={sites} clients={clients} system={system} activity={activity} onLaunch={() => setLaunchOpen(true)} onOpen={setSelectedId} />}
        {view === 'Sites' && <SitesView sites={visibleSites} clients={clients} total={sites.length} loading={loading} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onLaunch={() => setLaunchOpen(true)} onOpen={setSelectedId} />}
        {view === 'Clients' && <ClientsView clients={visibleClients} sites={sites} busy={busy} onAdd={() => { setEditingClient(null); setClientOpen(true); }} onEdit={(client) => { setEditingClient(client); setClientOpen(true); }} onDelete={deleteClient} onOpenSite={setSelectedId} />}
        {view === 'Activity' && <ActivityView entries={activity} />}
        {view === 'Settings' && <SettingsView system={system} />}
      </div>}
    </section>
    {launchOpen && <LaunchModal clients={clients} busy={busy === 'create'} onClose={() => setLaunchOpen(false)} onSubmit={createSite} />}
    {clientOpen && <ClientModal client={editingClient} busy={busy === 'client:save'} onClose={() => { setClientOpen(false); setEditingClient(null); }} onSubmit={createClient} />}
    {toast && <div className="toast" role="status"><span><Check aria-hidden="true" /></span>{toast}<button onClick={() => setToast(null)} aria-label="Dismiss notification"><X aria-hidden="true" /></button></div>}
  </main>;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>; }
function MetricCard({ icon: Icon, tone, label, value, detail, meta = 'Live' }: { icon: LucideIcon; tone: string; label: string; value: string; detail: string; meta?: string }) { return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}><Icon aria-hidden="true" /></span><small>{label}</small><em>{meta}</em></div><strong>{value}</strong><p>{detail}</p></article>; }

function Overview({ sites, clients, system, activity, onLaunch, onOpen }: { sites: Site[]; clients: Client[]; system: SystemInfo; activity: ActivityEntry[]; onLaunch: () => void; onOpen: (id: string) => void }) {
  const stopped = sites.filter((site) => site.status === 'Stopped').length;
  const unassigned = sites.filter((site) => !site.clientId).length;
  return <><PageHeading eyebrow="LOCAL INFRASTRUCTURE" title="Docker fleet" description="Live sites, client ownership and maintenance state from Docker Desktop." actions={<button className="primary-button" onClick={onLaunch}><Plus aria-hidden="true" />Launch WordPress</button>} />
    <div className="metric-grid"><MetricCard icon={CirclePlay} tone="green" label="Running sites" value={String(system.runningSites || 0)} detail={`${system.managedSites || 0} managed site${system.managedSites === 1 ? '' : 's'}`} /><MetricCard icon={Users} tone="blue" label="Clients" value={String(clients.length)} detail={`${unassigned} unassigned site${unassigned === 1 ? '' : 's'}`} /><MetricCard icon={Package} tone="amber" label="Updates" value={String(sites.reduce((sum, site) => sum + site.updates, 0))} detail={`${stopped} stopped site${stopped === 1 ? '' : 's'}`} /><MetricCard icon={Boxes} tone="violet" label="Docker containers" value={String(system.runningContainers || 0)} detail={`${system.totalContainers || 0} total on this engine`} /></div>
    <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>RECENT SITES</small><h2>WordPress containers</h2></div></div>{sites.slice(0, 5).map((site) => <button className="compact-site" key={site.id} onClick={() => onOpen(site.id)}><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span><Status site={site} /><em><ChevronRight aria-hidden="true" /></em></button>)}{!sites.length && <Empty title="No managed containers yet" copy="Launch your first WordPress site to create the fleet." />}</section><section className="content-card"><div className="card-title"><div><small>EDGE ROUTER</small><h2>Domain gateway</h2></div></div><div className="gateway-status"><span className={system.edge?.running ? 'gateway-on' : ''}><Globe2 aria-hidden="true" /></span><strong>{system.edge?.running ? 'Routing active' : 'Not started'}</strong><p>{system.edge?.running ? 'Traefik is listening on ports 80 and 443. Site hostnames route to their WordPress containers.' : 'The router starts automatically with the first site.'}</p><code>{system.edge?.container || 'geekheros-edge'}</code></div></section></div>
    <section className="content-card activity-card"><div className="card-title"><div><small>REAL OPERATIONS</small><h2>Recent activity</h2></div></div><ActivityList entries={activity.slice(0, 6)} /></section></>;
}

function SitesView({ sites, clients, total, loading, query, onQuery, filter, onFilter, onLaunch, onOpen }: { sites: Site[]; clients: Client[]; total: number; loading: boolean; query: string; onQuery: (value: string) => void; filter: Filter; onFilter: (value: Filter) => void; onLaunch: () => void; onOpen: (id: string) => void }) {
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  return <><PageHeading eyebrow="DOCKER FLEET" title="Sites" description="Every row maps to a real Docker WordPress container." actions={<button className="primary-button" onClick={onLaunch}><Plus aria-hidden="true" />Launch site</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={CirclePlay} tone="green" label="Running" value={String(sites.filter((site) => site.status === 'Running').length)} detail="Containers currently serving traffic" /><MetricCard icon={CircleAlert} tone="amber" label="Needs attention" value={String(sites.filter((site) => site.status !== 'Running').length)} detail="Stopped, provisioning or failed" /><MetricCard icon={Package} tone="violet" label="Updates found" value={String(sites.reduce((sum, site) => sum + site.updates, 0))} detail="From live package inventory" /><MetricCard icon={ArchiveRestore} tone="blue" label="Local backups" value={String(sites.reduce((sum, site) => sum + site.backupCount, 0))} detail="Stored outside application source" /></div>
    <section className="fleet-panel"><div className="panel-toolbar"><div className="filter-tabs">{(['All', 'Running', 'Attention'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilter(item)}>{item}</button>)}</div><label className="table-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search sites, clients or tags" /></label></div><div className="site-table" role="table"><div className="site-row table-header"><span>Site</span><span>Status</span><span>Client & tags</span><span>WordPress</span><span>Uptime</span><span /></div>{sites.map((site) => <button className="site-row" key={site.id} onClick={() => onOpen(site.id)}><div className="site-cell"><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span></div><Status site={site} /><span className="stacked"><strong>{site.clientId ? clientNames.get(site.clientId) || 'Unassigned' : 'Unassigned'}</strong><small>{site.tags.length ? site.tags.join(' · ') : 'No tags'}</small></span><span className="stacked"><strong>{site.wp === '—' ? 'Installing' : `WP ${site.wp}`}</strong><small>{site.updates} update{site.updates === 1 ? '' : 's'}</small></span><span className="uptime-cell"><strong>{site.uptime}</strong></span><span className="more-button"><ChevronRight aria-hidden="true" /></span></button>)}{!sites.length && <Empty title={loading ? 'Reading Docker Desktop…' : 'No WordPress sites yet'} copy={loading ? 'Live container state will appear here.' : 'Launch a site to create WordPress and MariaDB containers.'} />}</div><footer className="panel-footer"><span>Showing {sites.length} of {total} managed sites</span><span>Docker state refreshes automatically</span></footer></section></>;
}

function ClientsView({ clients, sites, busy, onAdd, onEdit, onDelete, onOpenSite }: { clients: Client[]; sites: Site[]; busy: string | null; onAdd: () => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void; onOpenSite: (id: string) => void }) {
  const assigned = sites.filter((site) => site.clientId).length;
  return <><PageHeading eyebrow="CLIENT OWNERSHIP" title="Clients" description="Group real WordPress sites by client without creating duplicate site records." actions={<button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add client</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={Users} tone="blue" label="Clients" value={String(clients.length)} detail="Stored in the local control plane" /><MetricCard icon={Container} tone="green" label="Assigned sites" value={String(assigned)} detail={`${sites.length - assigned} currently unassigned`} /><MetricCard icon={CirclePlay} tone="violet" label="Client sites online" value={String(sites.filter((site) => site.clientId && site.status === 'Running').length)} detail="Live Docker state" /><MetricCard icon={Package} tone="amber" label="Client updates" value={String(sites.filter((site) => site.clientId).reduce((sum, site) => sum + site.updates, 0))} detail="Pending maintenance items" /></div>
    <section className="client-list-panel">{clients.map((client) => { const clientSites = sites.filter((site) => site.clientId === client.id); return <article className="client-record" key={client.id}><div className="client-record-head"><span className="client-avatar">{initials(client.name)}</span><div><h2>{client.name}</h2>{client.company && <p>{client.company}</p>}</div><div className="client-record-actions"><button onClick={() => onEdit(client)}>Edit</button><button className="quiet-danger" disabled={busy === `client:${client.id}:delete`} onClick={() => onDelete(client)}>Remove</button></div></div><div className="client-contact">{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}{client.phone && <span>{client.phone}</span>}{!client.email && !client.phone && <span>No contact details saved</span>}</div>{client.notes && <p className="client-notes">{client.notes}</p>}<div className="client-sites"><strong>{client.siteCount} site{client.siteCount === 1 ? '' : 's'}</strong>{clientSites.map((site) => <button key={site.id} onClick={() => onOpenSite(site.id)}><span>{site.name}</span><Status site={site} /><em><ChevronRight aria-hidden="true" /></em></button>)}{!clientSites.length && <small>Assign a site from its Overview tab.</small>}</div></article>; })}{!clients.length && <Empty title="No clients yet" copy="Add a client, then assign existing or new WordPress sites to it." />}</section></>;
}

function SiteWorkspace({ site, clients, busy, onBack, onOperate, onSaveMetadata, onLogin }: { site: Site; clients: Client[]; busy: string | null; onBack: () => void; onOperate: (site: Site, type: string, options?: Record<string, unknown>) => Promise<boolean>; onSaveMetadata: (site: Site, clientId: string | null, tags: string[]) => Promise<boolean>; onLogin: (site: Site) => Promise<void> }) {
  const [tab, setTab] = useState<SiteTab>('Overview');
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [clientId, setClientId] = useState(site.clientId || '');
  const [tags, setTags] = useState(site.tags.join(', '));
  const isBusy = Boolean(busy?.startsWith(site.id));
  const canOperate = !isBusy && site.status !== 'Provisioning';

  const loadInventory = useCallback(async () => {
    if (site.status !== 'Running') { setInventory(null); return; }
    setInventoryLoading(true);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/inventory`, { cache: 'no-store' });
      const result = await response.json() as { inventory?: Inventory; error?: string };
      if (!response.ok || !result.inventory) throw new Error(result.error || 'Inventory could not be loaded.');
      setInventory(result.inventory); setInventoryError(null);
    } catch (failure) { setInventoryError(messageFrom(failure, 'Inventory could not be loaded.')); }
    finally { setInventoryLoading(false); }
  }, [site.id, site.status]);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void loadInventory()); return () => window.cancelAnimationFrame(frame); }, [loadInventory]);

  async function run(type: string, options: Record<string, unknown> = {}) { if (await onOperate(site, type, options)) await loadInventory(); }
  async function saveAssignment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSaveMetadata(site, clientId || null, tags.split(',').map((tag) => tag.trim()).filter(Boolean)); }

  return <div className="site-workspace"><div className="site-hero"><button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" />All sites</button><div className="site-hero-row"><div className="site-identity"><span className="large-site-avatar">{initials(site.name)}</span><div><div className="identity-title"><h1>{site.name}</h1><Status site={site} /></div><a href={site.siteUrl} target="_blank" rel="noreferrer">{site.domain}<ExternalLink aria-hidden="true" /></a><div className="hero-tags">{site.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div><div className="site-actions">{site.status === 'Stopped' ? <button className="secondary-button" disabled={!canOperate} onClick={() => void run('start')}><Play aria-hidden="true" />Start</button> : <button className="secondary-button" disabled={!canOperate} onClick={() => void run('stop')}><Square aria-hidden="true" />Stop</button>}<button className="secondary-button" disabled={!canOperate} onClick={() => void run('restart')}><RotateCw aria-hidden="true" />Restart</button><button className="primary-button" disabled={!canOperate || site.status !== 'Running'} onClick={() => void onLogin(site)}><LogIn aria-hidden="true" />One-click WP Admin</button></div></div><div className="site-quick-meta"><span><small>WordPress</small><strong>{site.wp}</strong></span><span><small>PHP</small><strong>{site.php}</strong></span><span><small>Profile</small><strong>{site.pod}</strong></span><span><small>Container</small><strong>{site.containerId || 'Preparing'}</strong></span><span><small>Uptime</small><strong>{site.uptime}</strong></span></div><nav className="site-tabs">{(['Overview', 'Updates', 'Backups', 'Tools'] as SiteTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Updates' && site.updates > 0 && <em>{site.updates}</em>}</button>)}</nav></div>
    <div className="site-tab-content">{site.error && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Last operation failed</strong><p>{site.error}</p></div></div>}{site.phase && <div className="provisioning-banner"><span className="spinner" /><div><strong>{site.phase}</strong><p>GeekHeros is applying the requested Docker state. This page refreshes automatically.</p></div></div>}{inventoryError && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Live WordPress inventory unavailable</strong><p>{inventoryError}</p></div></div>}
      {tab === 'Overview' && <SiteOverview site={site} clients={clients} clientId={clientId} tags={tags} busy={isBusy} onClientId={setClientId} onTags={setTags} onSave={saveAssignment} />}
      {tab === 'Updates' && <UpdatesPanel site={site} inventory={inventory} loading={inventoryLoading} disabled={!canOperate} onRun={run} onRefresh={loadInventory} />}
      {tab === 'Backups' && <BackupsPanel site={site} backups={inventory?.backups || []} disabled={!canOperate} onBackup={() => void run('backup')} />}
      {tab === 'Tools' && <ToolsPanel site={site} disabled={!canOperate} onRun={run} onLogin={() => void onLogin(site)} />}
    </div></div>;
}

function SiteOverview({ site, clients, clientId, tags, busy, onClientId, onTags, onSave }: { site: Site; clients: Client[]; clientId: string; tags: string; busy: boolean; onClientId: (value: string) => void; onTags: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return <><div className="metric-grid"><MetricCard icon={Container} tone="green" label="WordPress container" value={site.status} detail={site.containerName} /><MetricCard icon={Database} tone="violet" label="Database container" value="MariaDB" detail={site.databaseContainer} /><MetricCard icon={Package} tone="amber" label="Available updates" value={String(site.updates)} detail={`${site.updateCounts.plugins || 0} plugins · ${site.updateCounts.themes || 0} themes`} /><MetricCard icon={ArchiveRestore} tone="blue" label="Recovery points" value={String(site.backupCount)} detail={site.lastBackupAt ? `Last backup ${relativeTime(site.lastBackupAt)}` : 'No backups created'} /></div>
    <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>OWNERSHIP</small><h2>Client and tags</h2></div></div><form className="assignment-form" onSubmit={onSave}><label>Assigned client<select value={clientId} onChange={(event) => onClientId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}{client.company ? ` — ${client.company}` : ''}</option>)}</select></label><label>Tags<input value={tags} onChange={(event) => onTags(event.target.value)} placeholder="production, managed, ecommerce" /><small>Separate tags with commas.</small></label><button className="primary-button" disabled={busy}>Save assignment</button></form></section><section className="content-card"><div className="card-title"><div><small>EDGE ROUTING</small><h2>Domain</h2></div></div><div className="domain-detail"><span><Globe2 aria-hidden="true" /></span><strong>{site.domain}</strong><p>Traefik routes this hostname to the WordPress container over port 80.</p><a href={site.siteUrl} target="_blank" rel="noreferrer">Open domain<ExternalLink aria-hidden="true" /></a>{site.directUrl && <a href={site.directUrl} target="_blank" rel="noreferrer">Local preview<ExternalLink aria-hidden="true" /></a>}</div></section></div></>;
}

function UpdatesPanel({ site, inventory, loading, disabled, onRun, onRefresh }: { site: Site; inventory: Inventory | null; loading: boolean; disabled: boolean; onRun: (type: string, options?: Record<string, unknown>) => Promise<void>; onRefresh: () => Promise<void> }) {
  if (loading && !inventory) return <Empty title="Reading WordPress packages…" copy="Plugin, theme and core versions are coming directly from WP-CLI." />;
  if (!inventory) return <Empty title="No live inventory" copy={site.status === 'Running' ? 'Refresh the inventory to try again.' : 'Start the site to manage WordPress updates.'} />;
  const pluginUpdates = inventory.plugins.filter((item) => item.update === 'available');
  const themeUpdates = inventory.themes.filter((item) => item.update === 'available');
  return <div className="updates-layout"><section className="content-card core-update-card"><div><p className="eyebrow">WORDPRESS CORE</p><h2>Version {inventory.core.version}</h2><p>{inventory.core.update ? `Version ${inventory.core.update.version} is available.` : 'Core is current.'}</p></div><div className="package-actions"><button className="secondary-button" disabled={loading} onClick={() => void onRefresh()}>Refresh inventory</button>{inventory.core.update && <button className="primary-button" disabled={disabled} onClick={() => void onRun('update-core')}>Update core</button>}</div></section>
    <PackageTable title="Plugins" eyebrow={`${inventory.plugins.length} INSTALLED · ${pluginUpdates.length} UPDATES`} items={inventory.plugins} type="plugin" disabled={disabled} onRun={onRun} />
    <PackageTable title="Themes" eyebrow={`${inventory.themes.length} INSTALLED · ${themeUpdates.length} UPDATES`} items={inventory.themes} type="theme" disabled={disabled} onRun={onRun} />
  </div>;
}

function PackageTable({ title, eyebrow, items, type, disabled, onRun }: { title: string; eyebrow: string; items: PackageItem[]; type: 'plugin' | 'theme'; disabled: boolean; onRun: (type: string, options?: Record<string, unknown>) => Promise<void> }) {
  const updates = items.filter((item) => item.update === 'available');
  return <section className="content-card package-card"><div className="card-title"><div><small>{eyebrow}</small><h2>{title}</h2></div>{updates.length > 0 && <button className="secondary-button" disabled={disabled} onClick={() => void onRun(type === 'plugin' ? 'update-plugins' : 'update-themes', { packages: updates.map((item) => item.name) })}>Update all {updates.length}</button>}</div><div className="package-table"><div className="package-row package-header"><span>Package</span><span>Status</span><span>Version</span><span>Auto-update</span><span>Actions</span></div>{items.map((item) => <div className="package-row" key={`${type}:${item.name}`}><span><strong>{humanizeSlug(item.name)}</strong><small>{item.name}</small></span><span><i className={`package-status ${item.status}`} />{item.status}</span><span><strong>{item.version}</strong>{item.updateVersion && <small>→ {item.updateVersion}</small>}</span><span>{item.autoUpdate}</span><span className="row-actions">{item.update === 'available' && <button disabled={disabled} onClick={() => void onRun(type === 'plugin' ? 'update-plugins' : 'update-themes', { packages: [item.name] })}>Update</button>}{type === 'plugin' && item.status !== 'must-use' && <button disabled={disabled} onClick={() => void onRun(item.status === 'active' ? 'deactivate-plugin' : 'activate-plugin', { packages: [item.name] })}>{item.status === 'active' ? 'Deactivate' : 'Activate'}</button>}{type === 'theme' && item.status !== 'active' && <button disabled={disabled} onClick={() => void onRun('activate-theme', { packages: [item.name] })}>Activate</button>}</span></div>)}{!items.length && <Empty title={`No ${title.toLowerCase()} installed`} copy="WP-CLI returned an empty package list." />}</div></section>;
}

function BackupsPanel({ site, backups, disabled, onBackup }: { site: Site; backups: Backup[]; disabled: boolean; onBackup: () => void }) {
  return <section className="content-card"><div className="card-title"><div><small>LOCAL RECOVERY POINTS</small><h2>Backups</h2></div><button className="primary-button" disabled={disabled || site.status !== 'Running'} onClick={onBackup}>Create backup</button></div><p className="section-copy">Each recovery point contains a MariaDB export and an archive of the WordPress volume.</p><div className="backup-table"><div className="backup-row backup-header"><span>Created</span><span>Database</span><span>Files</span></div>{backups.map((backup) => <div className="backup-row" key={backup.id}><span><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{relativeTime(backup.createdAt)}</small></span><code>{backup.files.find((file) => file.endsWith('.sql')) || '—'}</code><code>{backup.files.find((file) => file.endsWith('.tar.gz')) || '—'}</code></div>)}{!backups.length && <Empty title="No backups yet" copy="Create a recovery point before maintenance or major content changes." />}</div></section>;
}

function ToolsPanel({ site, disabled, onRun, onLogin }: { site: Site; disabled: boolean; onRun: (type: string, options?: Record<string, unknown>) => Promise<void>; onLogin: () => void }) {
  return <><section className="content-card"><div className="card-title"><div><small>WORDPRESS & CONTAINER</small><h2>Site tools</h2></div></div><div className="operation-grid"><Operation icon={RefreshCw} title="Refresh inventory" copy="Read live core, plugin, theme and PHP versions." disabled={disabled} onClick={() => void onRun('refresh')} /><Operation icon={Upload} title="Update everything" copy="Back up, then update WordPress core, all plugins and all themes." disabled={disabled} onClick={() => void onRun('update')} /><Operation icon={ArchiveRestore} title="Create backup" copy="Export MariaDB and archive the WordPress volume." disabled={disabled} onClick={() => void onRun('backup')} /><Operation icon={ShieldCheck} title="Verify checksums" copy="Validate WordPress core and available plugin checksums." disabled={disabled} onClick={() => void onRun('scan')} /><Operation icon={RotateCw} title="Restart containers" copy="Restart MariaDB and WordPress in dependency order." disabled={disabled} onClick={() => void onRun('restart')} /><Operation icon={LogIn} title="One-click WP Admin" copy="Issue a one-time, 60-second administrator session." disabled={disabled} onClick={onLogin} /></div></section><section className="content-card tool-details"><div className="card-title"><div><small>RUNTIME DETAILS</small><h2>Container endpoints</h2></div></div><div className="definition-grid"><span><small>WordPress</small><strong>{site.containerName}</strong></span><span><small>MariaDB</small><strong>{site.databaseContainer}</strong></span><span><small>Image</small><strong>{site.image}</strong></span><span><small>Container ID</small><strong>{site.containerId || '—'}</strong></span><span><small>Domain</small><strong>{site.siteUrl}</strong></span><span><small>Local preview</small><strong>{site.directUrl || '—'}</strong></span></div></section><section className="danger-zone"><div><strong>Remove site</strong><p>Deletes both containers, their named volumes and local backups.</p></div><button disabled={disabled} onClick={() => void onRun('delete', { deleteData: true })}>Delete site and data</button></section></>;
}

function Operation({ icon: Icon, title, copy, disabled, onClick }: { icon: LucideIcon; title: string; copy: string; disabled: boolean; onClick: () => void }) { return <button className="operation-card" disabled={disabled} onClick={onClick}><span><Icon aria-hidden="true" /></span><strong>{title}</strong><small>{copy}</small><em>Run operation<ArrowRight aria-hidden="true" /></em></button>; }
function ActivityView({ entries }: { entries: ActivityEntry[] }) { return <><PageHeading eyebrow="AUDIT LOG" title="Activity" description="Completed and failed operations reported by the local Docker agent." /><section className="content-card"><ActivityList entries={entries} /></section></>; }
function ActivityList({ entries }: { entries: ActivityEntry[] }) { if (!entries.length) return <Empty title="No operations recorded" copy="Container launches and lifecycle actions will appear here." />; return <div className="timeline live-timeline">{entries.map((entry) => <div key={entry.id}><span className={`activity-dot ${entry.state === 'failed' ? 'red' : 'green'}`} /><span><strong>{entry.message}</strong><small>{entry.siteName} · {entry.type}</small></span><time>{relativeTime(entry.createdAt)}</time></div>)}</div>; }

function SettingsView({ system }: { system: SystemInfo }) { return <><PageHeading eyebrow="LOCAL RUNTIME" title="Settings" description="The control plane is connected to Docker Desktop through a loopback-only agent." /><div className="settings-layout"><aside className="settings-nav"><button className="selected">Docker connection</button><button disabled>HTTPS certificates</button><button disabled>Remote nodes</button></aside><section className="settings-main"><div className="settings-section"><div><h2>Docker engine</h2><p>Live details reported by the engine receiving control-plane operations.</p></div><div className="definition-grid"><span><small>Status</small><strong>{system.connected ? 'Connected' : 'Offline'}</strong></span><span><small>Version</small><strong>{system.dockerVersion || '—'}</strong></span><span><small>Operating system</small><strong>{system.operatingSystem || '—'}</strong></span><span><small>Resources</small><strong>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)}</strong></span><span><small>Agent</small><strong>{system.agent ? `${system.agent.host}:${system.agent.port}` : '—'}</strong></span><span><small>Edge gateway</small><strong>{system.edge?.running ? 'Running' : 'Starts with first site'}</strong></span></div></div><div className="settings-section"><div><h2>One-click WordPress login</h2><p>GeekHeros installs a protected MU-plugin into managed sites. Login capabilities are random, single-use, expire after 60 seconds and are posted rather than placed in URLs.</p></div><div className="setup-note"><span><Info aria-hidden="true" /></span><p>The MU-plugin cannot be deactivated from WordPress and hides the must-use plugin table from client administrators.</p></div></div><div className="settings-section"><div><h2>Domain routing</h2><p>Public domains need an A record pointing to this machine’s public IP, plus firewall/router forwarding for ports 80 and 443.</p></div><div className="setup-note"><span><Info aria-hidden="true" /></span><p>Use a <code>.localhost</code> hostname for an immediate local test.</p></div></div></section></div></>; }

function LaunchModal({ clients, busy, onClose, onSubmit }: { clients: Client[]; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><div className="modal-head"><div><p className="eyebrow">NEW DOCKER SITE</p><h2 id="launch-title">Launch WordPress</h2><p>Creates isolated WordPress and MariaDB containers, persistent volumes, networking and edge routing.</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Site name<input name="name" required maxLength={80} placeholder="Client marketing site" autoFocus /></label><label>Domain<input name="domain" required placeholder="client.localhost" /></label><label>Client<select name="clientId" defaultValue=""><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Container profile<select name="pod" defaultValue="Standard"><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select></label><label className="full-field">Tags<input name="tags" placeholder="production, managed, ecommerce" /></label><label>Administrator username<input name="adminUser" required defaultValue="admin" autoComplete="username" /></label><label>Administrator email<input name="adminEmail" type="email" required placeholder="admin@example.com" autoComplete="email" /></label><label className="full-field">Administrator password<input name="adminPassword" type="password" required minLength={12} placeholder="At least 12 characters" autoComplete="new-password" /></label></div><div className="launch-footnote"><span><Info aria-hidden="true" /></span><p>The password is used during installation and is not exposed in Docker labels or activity logs.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Starting containers…' : 'Launch site'}</button></div></form></section></div>; }

function ClientModal({ client, busy, onClose, onSubmit }: { client: Client | null; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="client-title"><div className="modal-head"><div><p className="eyebrow">CLIENT RECORD</p><h2 id="client-title">{client ? 'Edit client' : 'Add client'}</h2><p>{client ? 'Update the client record without changing its assigned sites.' : 'Create an empty client record, then assign real sites to it.'}</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Client name<input name="name" required maxLength={100} defaultValue={client?.name || ''} autoFocus /></label><label>Company<input name="company" maxLength={120} defaultValue={client?.company || ''} /></label><label>Email<input name="email" type="email" maxLength={160} defaultValue={client?.email || ''} /></label><label>Phone<input name="phone" maxLength={60} defaultValue={client?.phone || ''} /></label><label className="full-field">Notes<textarea name="notes" maxLength={1000} rows={4} defaultValue={client?.notes || ''} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save client'}</button></div></form></section></div>; }

function Status({ site }: { site: Site }) { const tone = site.status.toLowerCase().replace(/[^a-z]+/g, '-'); return <span className={`status-pill ${tone}`}><i />{site.phase || site.status}</span>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty-state"><strong>{title}</strong><span>{copy}</span></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase(); }
function humanizeSlug(value: string) { return value.split(/[-_]/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
function formatBytes(value: number) { if (!value) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function messageFrom(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
function operationLabel(type: string) { return ({ start: 'start', stop: 'stop', restart: 'restart', refresh: 'inventory refresh', backup: 'backup', update: 'full update', 'update-core': 'core update', 'update-plugins': 'plugin update', 'update-themes': 'theme update', 'activate-plugin': 'plugin activation', 'deactivate-plugin': 'plugin deactivation', 'activate-theme': 'theme activation', scan: 'checksum scan', delete: 'deletion' } as Record<string, string>)[type] || type; }
