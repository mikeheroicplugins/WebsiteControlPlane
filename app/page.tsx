'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArchiveRestore, ArrowLeft, ArrowRight, Boxes, Check, ChevronRight, CircleAlert,
  CirclePlay, Container, Database, ExternalLink, GitBranch, GitCommit, Globe2, House,
  Info, LogIn, Package, Play, Plus, RefreshCw, RotateCw, Search, Settings, ShieldCheck,
  Sparkles, Square, Upload, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type View = 'Overview' | 'Sites' | 'Clients' | 'Blueprints' | 'Activity' | 'Settings';
type Filter = 'All' | 'Running' | 'Attention';
type SiteTab = 'Overview' | 'Updates' | 'Backups' | 'Tools';
type SiteKind = 'wordpress' | 'lovable';
type LaunchMode = 'choose' | SiteKind | null;

type UpdateCounts = { core: number; plugins: number; themes: number };
type Site = {
  id: string; name: string; domain: string; status: string; phase: string | null; error: string | null;
  kind: SiteKind;
  clientId: string | null; tags: string[]; region: string; pod: string; wp: string; php: string;
  updates: number; updateCounts: UpdateCounts; uptime: string; createdAt: string; updatedAt: string;
  containerId: string | null; containerName: string; databaseContainer: string; image: string;
  directUrl: string | null; siteUrl: string; adminUrl: string | null; backupCount: number;
  backups: Backup[]; lastBackupAt: string | null; lastScannedAt: string | null;
  repositoryUrl: string | null; repositoryBranch: string | null; sourceRevision: string | null;
  lovableBuildUrl: string | null;
  blueprintId: string | null; blueprintName: string | null; blueprintAppliedAt: string | null;
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
type LovableWorkspace = { id: string; name: string };
type LovableConnection = {
  connected: boolean;
  account: { id: string; name: string; email: string } | null;
  workspaces: LovableWorkspace[];
  connectedAt: string | null;
  error?: string;
};
type ActivityEntry = {
  id: string; siteId: string; siteName: string; type: string; state: string; message: string; createdAt: string;
};
type LoginResponse = { actionUrl: string; action: string; token: string; expiresAt: string };
type BlueprintFileKind = 'plugin' | 'theme' | 'settings' | 'content' | 'mu-plugin' | 'wp-content';
type BlueprintFile = { id: string; name: string; kind: BlueprintFileKind; destination: string; size: number; sha256: string };
type BlueprintPackage = { slug: string; activate: boolean };
type Blueprint = {
  id: string; name: string; description: string; plugins: BlueprintPackage[]; themes: BlueprintPackage[];
  files: BlueprintFile[]; fileCount: number; totalBytes: number; usageCount: number; createdAt: string; updatedAt: string;
};
type BlueprintUpload = { id: string; file: File; kind: BlueprintFileKind; destination: string };
type BlueprintInput = { name: string; description: string; plugins: string[]; themes: string[]; files: Array<{ name: string; kind: BlueprintFileKind; destination: string; content: string }> };

const nav: Array<{ view: View; icon: LucideIcon }> = [
  { view: 'Overview', icon: House }, { view: 'Sites', icon: Container }, { view: 'Clients', icon: Users },
  { view: 'Blueprints', icon: Boxes },
  { view: 'Activity', icon: Activity }, { view: 'Settings', icon: Settings },
];

export default function Home() {
  const [view, setView] = useState<View>('Sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [system, setSystem] = useState<SystemInfo>({ connected: false });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [launchMode, setLaunchMode] = useState<LaunchMode>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [preferredBlueprintId, setPreferredBlueprintId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [systemResponse, sitesResponse, clientsResponse, blueprintsResponse, activityResponse] = await Promise.all([
        fetch('/api/system', { cache: 'no-store' }), fetch('/api/sites', { cache: 'no-store' }),
        fetch('/api/clients', { cache: 'no-store' }), fetch('/api/blueprints', { cache: 'no-store' }),
        fetch('/api/activity', { cache: 'no-store' }),
      ]);
      const [systemData, sitesData, clientsData, blueprintsData, activityData] = await Promise.all([
        systemResponse.json().catch(() => ({ connected: false, error: 'Unable to read Docker status.' })),
        sitesResponse.json().catch(() => ({ sites: [] })), clientsResponse.json().catch(() => ({ clients: [] })),
        blueprintsResponse.json().catch(() => ({ blueprints: [] })),
        activityResponse.json().catch(() => ({ activity: [] })),
      ]) as [SystemInfo, { sites?: Site[]; error?: string }, { clients?: Client[] }, { blueprints?: Blueprint[] }, { activity?: ActivityEntry[] }];
      setSystem(systemData);
      if (sitesResponse.ok) setSites(sitesData.sites || []);
      if (clientsResponse.ok) setClients(clientsData.clients || []);
      if (blueprintsResponse.ok) setBlueprints(blueprintsData.blueprints || []);
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
    const searchMatch = `${site.name} ${site.domain} ${site.kind} ${site.containerName} ${site.repositoryUrl || ''} ${site.repositoryBranch || ''} ${site.tags.join(' ')} ${site.clientId ? clientNames.get(site.clientId) || '' : ''}`.toLowerCase().includes(query.toLowerCase());
    const filterMatch = filter === 'All' || (filter === 'Running' ? site.status === 'Running' : site.status !== 'Running' || Boolean(site.error));
    return searchMatch && filterMatch;
  }), [clientNames, filter, query, sites]);
  const visibleClients = useMemo(() => clients.filter((client) => `${client.name} ${client.company} ${client.email} ${client.phone}`.toLowerCase().includes(query.toLowerCase())), [clients, query]);
  const visibleBlueprints = useMemo(() => blueprints.filter((blueprint) => `${blueprint.name} ${blueprint.description} ${blueprint.plugins.map((plugin) => plugin.slug).join(' ')} ${blueprint.themes.map((theme) => theme.slug).join(' ')} ${blueprint.files.map((file) => file.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [blueprints, query]);

  function navigate(next: View) { setView(next); setSelectedId(null); }
  function openLaunch() { setPreferredBlueprintId(null); setLaunchMode('choose'); }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('create');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { site?: Site; error?: string };
      if (!response.ok || !result.site) throw new Error(result.error || 'The site could not be launched.');
      setLaunchMode(null); setView('Sites'); setSelectedId(result.site.id);
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

  async function createBlueprint(input: BlueprintInput) {
    setBusy('blueprint:create');
    try {
      const response = await fetch('/api/blueprints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const result = await response.json() as { blueprint?: Blueprint; error?: string };
      if (!response.ok || !result.blueprint) throw new Error(result.error || 'The blueprint could not be saved.');
      setBlueprintOpen(false); setToast(`${result.blueprint.name} is ready for WordPress launches.`); await refresh(true);
    } catch (failure) { throw new Error(messageFrom(failure, 'The blueprint could not be saved.')); }
    finally { setBusy(null); }
  }

  async function deleteBlueprint(blueprint: Blueprint) {
    if (!window.confirm(`Remove ${blueprint.name}? Existing sites are protected and will prevent removal.`)) return;
    setBusy(`blueprint:${blueprint.id}:delete`);
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(blueprint.id)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The blueprint could not be removed.');
      setToast(`${blueprint.name} was removed.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The blueprint could not be removed.')); }
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
      <nav aria-label="Primary navigation"><p className="nav-label">Control plane</p>{nav.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-item ${view === item.view && !selected ? 'active' : ''}`}><span><item.icon aria-hidden="true" /></span>{item.view}{item.view === 'Sites' && <em>{sites.length}</em>}{item.view === 'Clients' && <em>{clients.length}</em>}{item.view === 'Blueprints' && <em>{blueprints.length}</em>}</button>)}</nav>
      <div className="node-card"><div className="node-card-head"><span>Managed fleet</span><strong>{system.runningSites || 0}/{system.managedSites || 0}</strong></div><div className="capacity-track"><span style={{ width: `${system.managedSites ? Math.round(((system.runningSites || 0) / system.managedSites) * 100) : 0}%` }} /></div><small>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)} memory</small></div>
      <div className="sidebar-user"><span className="user-avatar">GH</span><span className="workspace-copy"><strong>Local administrator</strong><small>Docker access enabled</small></span></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><label className="global-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sites, clients and blueprints" /></label><div className={`top-actions ${system.connected ? '' : 'offline-copy'}`}><span className="live-dot" />{system.connected ? `Docker ${system.dockerVersion}` : 'Docker agent offline'}<button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw aria-hidden="true" /></button></div></header>
      {error && <div className="connection-banner"><span><CircleAlert aria-hidden="true" /></span><div><strong>Docker control is unavailable</strong><p>{error}</p></div><button onClick={() => void refresh()}>Retry connection</button></div>}
      {selected ? <SiteWorkspace key={selected.id} site={selected} clients={clients} busy={busy} onBack={() => setSelectedId(null)} onOperate={operate} onSaveMetadata={saveMetadata} onLogin={oneClickLogin} /> : <div className="page-content">
        {view === 'Overview' && <Overview sites={sites} clients={clients} system={system} activity={activity} onLaunch={openLaunch} onOpen={setSelectedId} />}
        {view === 'Sites' && <SitesView sites={visibleSites} clients={clients} total={sites.length} loading={loading} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onLaunch={openLaunch} onOpen={setSelectedId} />}
        {view === 'Clients' && <ClientsView clients={visibleClients} sites={sites} busy={busy} onAdd={() => { setEditingClient(null); setClientOpen(true); }} onEdit={(client) => { setEditingClient(client); setClientOpen(true); }} onDelete={deleteClient} onOpenSite={setSelectedId} />}
        {view === 'Blueprints' && <BlueprintsView blueprints={visibleBlueprints} busy={busy} onAdd={() => setBlueprintOpen(true)} onDelete={deleteBlueprint} onLaunch={(blueprintId) => { setPreferredBlueprintId(blueprintId); setLaunchMode('wordpress'); }} />}
        {view === 'Activity' && <ActivityView entries={activity} />}
        {view === 'Settings' && <SettingsView system={system} onToast={setToast} />}
      </div>}
    </section>
    {launchMode === 'choose' && <LaunchChoiceModal onClose={() => setLaunchMode(null)} onChoose={(kind) => { setPreferredBlueprintId(null); setLaunchMode(kind); }} />}
    {launchMode === 'wordpress' && <WordPressLaunchModal clients={clients} blueprints={blueprints} defaultBlueprintId={preferredBlueprintId || ''} busy={busy === 'create'} onBack={() => setLaunchMode('choose')} onClose={() => setLaunchMode(null)} onSubmit={createSite} />}
    {launchMode === 'lovable' && <LovableLaunchModal clients={clients} busy={busy === 'create'} onBack={() => setLaunchMode('choose')} onClose={() => setLaunchMode(null)} onOpenSettings={() => { setLaunchMode(null); navigate('Settings'); }} onSubmit={createSite} />}
    {clientOpen && <ClientModal client={editingClient} busy={busy === 'client:save'} onClose={() => { setClientOpen(false); setEditingClient(null); }} onSubmit={createClient} />}
    {blueprintOpen && <BlueprintModal busy={busy === 'blueprint:create'} onClose={() => setBlueprintOpen(false)} onSubmit={createBlueprint} />}
    {toast && <div className="toast" role="status"><span><Check aria-hidden="true" /></span>{toast}<button onClick={() => setToast(null)} aria-label="Dismiss notification"><X aria-hidden="true" /></button></div>}
  </main>;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>; }
function MetricCard({ icon: Icon, tone, label, value, detail, meta = 'Live' }: { icon: LucideIcon; tone: string; label: string; value: string; detail: string; meta?: string }) { return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}><Icon aria-hidden="true" /></span><small>{label}</small><em>{meta}</em></div><strong>{value}</strong><p>{detail}</p></article>; }

function Overview({ sites, clients, system, activity, onLaunch, onOpen }: { sites: Site[]; clients: Client[]; system: SystemInfo; activity: ActivityEntry[]; onLaunch: () => void; onOpen: (id: string) => void }) {
  const stopped = sites.filter((site) => site.status === 'Stopped').length;
  const unassigned = sites.filter((site) => !site.clientId).length;
  return <><PageHeading eyebrow="LOCAL INFRASTRUCTURE" title="Docker fleet" description="Live sites, client ownership and maintenance state from Docker Desktop." actions={<button className="primary-button" onClick={onLaunch}><Plus aria-hidden="true" />Launch site</button>} />
    <div className="metric-grid"><MetricCard icon={CirclePlay} tone="green" label="Running sites" value={String(system.runningSites || 0)} detail={`${system.managedSites || 0} managed site${system.managedSites === 1 ? '' : 's'}`} /><MetricCard icon={Users} tone="blue" label="Clients" value={String(clients.length)} detail={`${unassigned} unassigned site${unassigned === 1 ? '' : 's'}`} /><MetricCard icon={Package} tone="amber" label="Updates" value={String(sites.reduce((sum, site) => sum + site.updates, 0))} detail={`${stopped} stopped site${stopped === 1 ? '' : 's'}`} /><MetricCard icon={Boxes} tone="violet" label="Docker containers" value={String(system.runningContainers || 0)} detail={`${system.totalContainers || 0} total on this engine`} /></div>
    <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>RECENT SITES</small><h2>Managed workloads</h2></div></div>{sites.slice(0, 5).map((site) => <button className="compact-site" key={site.id} onClick={() => onOpen(site.id)}><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain} · {site.kind === 'lovable' ? 'Lovable' : 'WordPress'}</small></span><Status site={site} /><em><ChevronRight aria-hidden="true" /></em></button>)}{!sites.length && <Empty title="No managed containers yet" copy="Launch your first WordPress or Lovable site to create the fleet." />}</section><section className="content-card"><div className="card-title"><div><small>EDGE ROUTER</small><h2>Domain gateway</h2></div></div><div className="gateway-status"><span className={system.edge?.running ? 'gateway-on' : ''}><Globe2 aria-hidden="true" /></span><strong>{system.edge?.running ? 'Routing active' : 'Not started'}</strong><p>{system.edge?.running ? 'Traefik is listening on ports 80 and 443. Site hostnames route to their application containers.' : 'The router starts automatically with the first site.'}</p><code>{system.edge?.container || 'geekheros-edge'}</code></div></section></div>
    <section className="content-card activity-card"><div className="card-title"><div><small>REAL OPERATIONS</small><h2>Recent activity</h2></div></div><ActivityList entries={activity.slice(0, 6)} /></section></>;
}

function SitesView({ sites, clients, total, loading, query, onQuery, filter, onFilter, onLaunch, onOpen }: { sites: Site[]; clients: Client[]; total: number; loading: boolean; query: string; onQuery: (value: string) => void; filter: Filter; onFilter: (value: Filter) => void; onLaunch: () => void; onOpen: (id: string) => void }) {
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  return <><PageHeading eyebrow="DOCKER FLEET" title="Sites" description="Every row maps to a real WordPress or Lovable Docker workload." actions={<button className="primary-button" onClick={onLaunch}><Plus aria-hidden="true" />Launch site</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={CirclePlay} tone="green" label="Running" value={String(sites.filter((site) => site.status === 'Running').length)} detail="Containers currently serving traffic" /><MetricCard icon={CircleAlert} tone="amber" label="Needs attention" value={String(sites.filter((site) => site.status !== 'Running').length)} detail="Stopped, provisioning or failed" /><MetricCard icon={Package} tone="violet" label="Updates found" value={String(sites.reduce((sum, site) => sum + site.updates, 0))} detail="WordPress packages and Lovable source" /><MetricCard icon={ArchiveRestore} tone="blue" label="Local backups" value={String(sites.reduce((sum, site) => sum + site.backupCount, 0))} detail="Stored outside application source" /></div>
    <section className="fleet-panel"><div className="panel-toolbar"><div className="filter-tabs">{(['All', 'Running', 'Attention'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilter(item)}>{item}</button>)}</div><label className="table-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search sites, clients or tags" /></label></div><div className="site-table" role="table"><div className="site-row table-header"><span>Site</span><span>Status</span><span>Client & tags</span><span>Workload</span><span>Uptime</span><span /></div>{sites.map((site) => <button className="site-row" key={site.id} onClick={() => onOpen(site.id)}><div className="site-cell"><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span></div><Status site={site} /><span className="stacked"><strong>{site.clientId ? clientNames.get(site.clientId) || 'Unassigned' : 'Unassigned'}</strong><small>{site.tags.length ? site.tags.join(' · ') : 'No tags'}</small></span><span className="stacked"><strong>{site.kind === 'lovable' ? 'Lovable build' : site.wp === '—' ? 'Installing WordPress' : `WP ${site.wp}`}</strong><small>{site.kind === 'lovable' ? `${site.repositoryBranch || 'main'} branch` : `${site.updates} update${site.updates === 1 ? '' : 's'}`}</small></span><span className="uptime-cell"><strong>{site.uptime}</strong></span><span className="more-button"><ChevronRight aria-hidden="true" /></span></button>)}{!sites.length && <Empty title={loading ? 'Reading Docker Desktop…' : 'No managed sites yet'} copy={loading ? 'Live container state will appear here.' : 'Launch a WordPress or Lovable workload into Docker Desktop.'} />}</div><footer className="panel-footer"><span>Showing {sites.length} of {total} managed sites</span><span>Docker state refreshes automatically</span></footer></section></>;
}

function ClientsView({ clients, sites, busy, onAdd, onEdit, onDelete, onOpenSite }: { clients: Client[]; sites: Site[]; busy: string | null; onAdd: () => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void; onOpenSite: (id: string) => void }) {
  const assigned = sites.filter((site) => site.clientId).length;
  return <><PageHeading eyebrow="CLIENT OWNERSHIP" title="Clients" description="Group real WordPress and Lovable sites by client without duplicate records." actions={<button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add client</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={Users} tone="blue" label="Clients" value={String(clients.length)} detail="Stored in the local control plane" /><MetricCard icon={Container} tone="green" label="Assigned sites" value={String(assigned)} detail={`${sites.length - assigned} currently unassigned`} /><MetricCard icon={CirclePlay} tone="violet" label="Client sites online" value={String(sites.filter((site) => site.clientId && site.status === 'Running').length)} detail="Live Docker state" /><MetricCard icon={Package} tone="amber" label="Client updates" value={String(sites.filter((site) => site.clientId).reduce((sum, site) => sum + site.updates, 0))} detail="Pending maintenance items" /></div>
    <section className="client-list-panel">{clients.map((client) => { const clientSites = sites.filter((site) => site.clientId === client.id); return <article className="client-record" key={client.id}><div className="client-record-head"><span className="client-avatar">{initials(client.name)}</span><div><h2>{client.name}</h2>{client.company && <p>{client.company}</p>}</div><div className="client-record-actions"><button onClick={() => onEdit(client)}>Edit</button><button className="quiet-danger" disabled={busy === `client:${client.id}:delete`} onClick={() => onDelete(client)}>Remove</button></div></div><div className="client-contact">{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}{client.phone && <span>{client.phone}</span>}{!client.email && !client.phone && <span>No contact details saved</span>}</div>{client.notes && <p className="client-notes">{client.notes}</p>}<div className="client-sites"><strong>{client.siteCount} site{client.siteCount === 1 ? '' : 's'}</strong>{clientSites.map((site) => <button key={site.id} onClick={() => onOpenSite(site.id)}><span>{site.name} · {site.kind === 'lovable' ? 'Lovable' : 'WordPress'}</span><Status site={site} /><em><ChevronRight aria-hidden="true" /></em></button>)}{!clientSites.length && <small>Assign a site from its Overview tab.</small>}</div></article>; })}{!clients.length && <Empty title="No clients yet" copy="Add a client, then assign existing WordPress or Lovable sites to it." />}</section></>;
}

function BlueprintsView({ blueprints, busy, onAdd, onDelete, onLaunch }: { blueprints: Blueprint[]; busy: string | null; onAdd: () => void; onDelete: (blueprint: Blueprint) => void; onLaunch: (blueprintId: string) => void }) {
  const pluginCount = blueprints.reduce((sum, blueprint) => sum + blueprint.plugins.length + blueprint.files.filter((file) => file.kind === 'plugin' || file.kind === 'mu-plugin').length, 0);
  const configurationCount = blueprints.reduce((sum, blueprint) => sum + blueprint.files.filter((file) => !['plugin', 'mu-plugin'].includes(file.kind)).length, 0);
  const usageCount = blueprints.reduce((sum, blueprint) => sum + blueprint.usageCount, 0);
  return <><PageHeading eyebrow="WORDPRESS STARTERS" title="Blueprints" description="Reusable plugin, theme, content and configuration packages for nearly finished WordPress launches." actions={<button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add blueprint</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={Boxes} tone="green" label="Blueprints" value={String(blueprints.length)} detail="Stored only on this local control plane" /><MetricCard icon={Package} tone="violet" label="Plugin packages" value={String(pluginCount)} detail="WordPress.org, ZIP and must-use plugins" /><MetricCard icon={Database} tone="blue" label="Setup files" value={String(configurationCount)} detail="Settings, content, themes and wp-content files" /><MetricCard icon={CirclePlay} tone="amber" label="Sites launched" value={String(usageCount)} detail="Managed sites tied to a blueprint" /></div>
    <section className="blueprint-grid">{blueprints.map((blueprint, index) => <article className="blueprint-card" key={blueprint.id}><div className={`blueprint-cover ${index % 3 === 1 ? 'violet' : index % 3 === 2 ? 'blue' : ''}`}><span><Boxes aria-hidden="true" /></span><small>WORDPRESS BLUEPRINT</small></div><div className="blueprint-body"><div className="blueprint-title"><h2>{blueprint.name}</h2><button className="blueprint-remove" disabled={busy === `blueprint:${blueprint.id}:delete` || blueprint.usageCount > 0} onClick={() => onDelete(blueprint)}>{blueprint.usageCount > 0 ? 'In use' : 'Remove'}</button></div><p>{blueprint.description || 'Reusable WordPress setup package.'}</p><div className="blueprint-meta"><span>{blueprint.plugins.length} plugin slug{blueprint.plugins.length === 1 ? '' : 's'}</span><span>{blueprint.themes.length} theme{blueprint.themes.length === 1 ? '' : 's'}</span><span>{blueprint.fileCount} file{blueprint.fileCount === 1 ? '' : 's'}</span><span>{formatBytes(blueprint.totalBytes)}</span></div><div className="blueprint-files">{blueprint.plugins.slice(0, 2).map((plugin) => <span key={`plugin:${plugin.slug}`}><Package aria-hidden="true" /><strong>{plugin.slug}</strong><small>WordPress.org plugin</small></span>)}{blueprint.themes.slice(0, 1).map((theme) => <span key={`theme:${theme.slug}`}><Boxes aria-hidden="true" /><strong>{theme.slug}</strong><small>WordPress.org theme</small></span>)}{blueprint.files.slice(0, Math.max(0, 4 - Math.min(3, blueprint.plugins.length + blueprint.themes.length))).map((file) => <span key={file.id}><ArchiveRestore aria-hidden="true" /><strong>{file.name}</strong><small>{blueprintFileKindLabel(file.kind)}</small></span>)}{blueprintItemCount(blueprint) > 4 && <em>+{blueprintItemCount(blueprint) - 4} more item{blueprintItemCount(blueprint) - 4 === 1 ? '' : 's'}</em>}</div><button className="secondary-button full-button" onClick={() => onLaunch(blueprint.id)}><CirclePlay aria-hidden="true" />Launch with blueprint</button></div></article>)}{!blueprints.length && <div className="blueprint-empty"><Empty title="No WordPress blueprints yet" copy="Add plugins, themes, settings JSON, content exports, must-use plugins or any file destined for wp-content." /><button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add your first blueprint</button></div>}</section></>;
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
    if (site.kind === 'lovable' || site.status !== 'Running') { setInventory(null); setInventoryError(null); return; }
    setInventoryLoading(true);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/inventory`, { cache: 'no-store' });
      const result = await response.json() as { inventory?: Inventory; error?: string };
      if (!response.ok || !result.inventory) throw new Error(result.error || 'Inventory could not be loaded.');
      setInventory(result.inventory); setInventoryError(null);
    } catch (failure) { setInventoryError(messageFrom(failure, 'Inventory could not be loaded.')); }
    finally { setInventoryLoading(false); }
  }, [site.id, site.kind, site.status]);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void loadInventory()); return () => window.cancelAnimationFrame(frame); }, [loadInventory]);

  async function run(type: string, options: Record<string, unknown> = {}) { if (await onOperate(site, type, options)) await loadInventory(); }
  async function saveAssignment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSaveMetadata(site, clientId || null, tags.split(',').map((tag) => tag.trim()).filter(Boolean)); }

  return <div className="site-workspace"><div className="site-hero"><button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" />All sites</button><div className="site-hero-row"><div className="site-identity"><span className="large-site-avatar">{initials(site.name)}</span><div><div className="identity-title"><h1>{site.name}</h1><Status site={site} /></div><a href={site.siteUrl} target="_blank" rel="noreferrer">{site.domain}<ExternalLink aria-hidden="true" /></a><div className="hero-tags"><span>{site.kind === 'lovable' ? 'Lovable' : 'WordPress'}</span>{site.blueprintName && <span>{site.blueprintName} blueprint</span>}{site.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div><div className="site-actions">{site.status === 'Stopped' ? <button className="secondary-button" disabled={!canOperate} onClick={() => void run('start')}><Play aria-hidden="true" />Start</button> : <button className="secondary-button" disabled={!canOperate} onClick={() => void run('stop')}><Square aria-hidden="true" />Stop</button>}<button className="secondary-button" disabled={!canOperate} onClick={() => void run('restart')}><RotateCw aria-hidden="true" />Restart</button>{site.kind === 'wordpress' ? <button className="primary-button" disabled={!canOperate || site.status !== 'Running'} onClick={() => void onLogin(site)}><LogIn aria-hidden="true" />One-click WP Admin</button> : site.lovableBuildUrl && <a className="primary-button link-button" href={site.lovableBuildUrl} target="_blank" rel="noreferrer"><Sparkles aria-hidden="true" />Open in Lovable</a>}</div></div><div className="site-quick-meta"><span><small>{site.kind === 'lovable' ? 'Source' : 'WordPress'}</small><strong>{site.kind === 'lovable' ? 'Lovable / Git' : site.wp}</strong></span><span><small>{site.kind === 'lovable' ? 'Branch' : 'PHP'}</small><strong>{site.kind === 'lovable' ? site.repositoryBranch || 'main' : site.php}</strong></span><span><small>Profile</small><strong>{site.pod}</strong></span><span><small>Container</small><strong>{site.containerId || 'Preparing'}</strong></span><span><small>Uptime</small><strong>{site.uptime}</strong></span></div><nav className="site-tabs">{(['Overview', 'Updates', 'Backups', 'Tools'] as SiteTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{site.kind === 'lovable' && item === 'Updates' ? 'Deployments' : item}{item === 'Updates' && site.updates > 0 && <em>{site.updates}</em>}</button>)}</nav></div>
    <div className="site-tab-content">{site.error && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Last operation failed</strong><p>{site.error}</p></div></div>}{site.phase && <div className="provisioning-banner"><span className="spinner" /><div><strong>{site.phase}</strong><p>GeekHeros is applying the requested Docker state. This page refreshes automatically.</p></div></div>}{site.kind === 'wordpress' && inventoryError && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Live WordPress inventory unavailable</strong><p>{inventoryError}</p></div></div>}
      {tab === 'Overview' && <SiteOverview site={site} clients={clients} clientId={clientId} tags={tags} busy={isBusy} onClientId={setClientId} onTags={setTags} onSave={saveAssignment} />}
      {tab === 'Updates' && (site.kind === 'lovable' ? <LovableDeploymentsPanel site={site} disabled={!canOperate} onRun={run} /> : <UpdatesPanel site={site} inventory={inventory} loading={inventoryLoading} disabled={!canOperate} onRun={run} onRefresh={loadInventory} />)}
      {tab === 'Backups' && <BackupsPanel site={site} backups={inventory?.backups || site.backups || []} disabled={!canOperate} onBackup={() => void run('backup')} />}
      {tab === 'Tools' && <ToolsPanel site={site} disabled={!canOperate} onRun={run} onLogin={() => void onLogin(site)} />}
    </div></div>;
}

function SiteOverview({ site, clients, clientId, tags, busy, onClientId, onTags, onSave }: { site: Site; clients: Client[]; clientId: string; tags: string; busy: boolean; onClientId: (value: string) => void; onTags: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const isLovable = site.kind === 'lovable';
  return <><div className="metric-grid"><MetricCard icon={Container} tone="green" label={isLovable ? 'Application container' : 'WordPress container'} value={site.status} detail={site.containerName} /><MetricCard icon={isLovable ? GitBranch : Database} tone="violet" label={isLovable ? 'Source branch' : 'Database container'} value={isLovable ? site.repositoryBranch || 'main' : 'MariaDB'} detail={isLovable ? shortRevision(site.sourceRevision) : site.databaseContainer} /><MetricCard icon={isLovable ? GitCommit : Package} tone="amber" label={isLovable ? 'Source changes' : 'Available updates'} value={String(site.updates)} detail={isLovable ? (site.updates ? 'Remote commits are ready to deploy' : 'Deployed revision is current') : `${site.updateCounts.plugins || 0} plugins · ${site.updateCounts.themes || 0} themes`} /><MetricCard icon={ArchiveRestore} tone="blue" label="Recovery points" value={String(site.backupCount)} detail={site.lastBackupAt ? `Last backup ${relativeTime(site.lastBackupAt)}` : 'No backups created'} /></div>
    <div className="dashboard-grid"><section className="content-card span-two"><div className="card-title"><div><small>OWNERSHIP</small><h2>Client and tags</h2></div></div><form className="assignment-form" onSubmit={onSave}><label>Assigned client<select value={clientId} onChange={(event) => onClientId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}{client.company ? ` — ${client.company}` : ''}</option>)}</select></label><label>Tags<input value={tags} onChange={(event) => onTags(event.target.value)} placeholder="production, managed, ecommerce" /><small>Separate tags with commas.</small></label><button className="primary-button" disabled={busy}>Save assignment</button></form></section><section className="content-card"><div className="card-title"><div><small>EDGE ROUTING</small><h2>Domain</h2></div></div><div className="domain-detail"><span><Globe2 aria-hidden="true" /></span><strong>{site.domain}</strong><p>Traefik routes this hostname to the {isLovable ? 'Lovable application' : 'WordPress'} container over port 80.</p><a href={site.siteUrl} target="_blank" rel="noreferrer">Open domain<ExternalLink aria-hidden="true" /></a>{site.directUrl && <a href={site.directUrl} target="_blank" rel="noreferrer">Local preview<ExternalLink aria-hidden="true" /></a>}</div></section></div></>;
}

function LovableDeploymentsPanel({ site, disabled, onRun }: { site: Site; disabled: boolean; onRun: (type: string) => Promise<void> }) {
  return <div className="updates-layout"><section className="content-card core-update-card"><div><p className="eyebrow">LOVABLE SOURCE</p><h2>{site.updates ? 'A new revision is ready' : 'Deployment is current'}</h2><p>GeekHeros builds the synced repository in an isolated Node environment and serves the resulting Vite bundle from Nginx.</p></div><div className="package-actions"><button className="secondary-button" disabled={disabled} onClick={() => void onRun('refresh')}><RefreshCw aria-hidden="true" />Check source</button><button className="primary-button" disabled={disabled} onClick={() => void onRun('redeploy')}><Upload aria-hidden="true" />Back up & deploy</button></div></section><section className="content-card lovable-source-card"><div className="card-title"><div><small>GIT SYNC</small><h2>Deployment source</h2></div>{site.repositoryUrl && <a href={site.repositoryUrl} target="_blank" rel="noreferrer">Open repository<ExternalLink aria-hidden="true" /></a>}</div><div className="definition-grid"><span><small>Repository</small><strong>{site.repositoryUrl || '—'}</strong></span><span><small>Branch</small><strong>{site.repositoryBranch || 'main'}</strong></span><span><small>Deployed commit</small><strong>{shortRevision(site.sourceRevision)}</strong></span><span><small>Last checked</small><strong>{site.lastScannedAt ? relativeTime(site.lastScannedAt) : 'Not checked'}</strong></span></div></section></div>;
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
  const isLovable = site.kind === 'lovable';
  return <section className="content-card"><div className="card-title"><div><small>LOCAL RECOVERY POINTS</small><h2>Backups</h2></div><button className="primary-button" disabled={disabled || site.status !== 'Running'} onClick={onBackup}>Create backup</button></div><p className="section-copy">{isLovable ? 'Each recovery point archives the exact Lovable source checkout used by the local build.' : 'Each recovery point contains a MariaDB export and an archive of the WordPress volume.'}</p><div className="backup-table"><div className="backup-row backup-header"><span>Created</span><span>{isLovable ? 'Source' : 'Database'}</span><span>Files</span></div>{backups.map((backup) => <div className="backup-row" key={backup.id}><span><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{relativeTime(backup.createdAt)}</small></span><code>{isLovable ? backup.files[0] || '—' : backup.files.find((file) => file.endsWith('.sql')) || '—'}</code><code>{backup.files.find((file) => file.endsWith('.tar.gz')) || '—'}</code></div>)}{!backups.length && <Empty title="No backups yet" copy="Create a recovery point before maintenance or major content changes." />}</div></section>;
}

function ToolsPanel({ site, disabled, onRun, onLogin }: { site: Site; disabled: boolean; onRun: (type: string, options?: Record<string, unknown>) => Promise<void>; onLogin: () => void }) {
  const isLovable = site.kind === 'lovable';
  return <><section className="content-card"><div className="card-title"><div><small>{isLovable ? 'LOVABLE & CONTAINER' : 'WORDPRESS & CONTAINER'}</small><h2>Site tools</h2></div></div><div className="operation-grid">{isLovable ? <><Operation icon={RefreshCw} title="Check source" copy="Compare the deployed commit with the configured Git branch." disabled={disabled} onClick={() => void onRun('refresh')} /><Operation icon={Upload} title="Deploy latest" copy="Back up the checkout, pull the branch, rebuild and replace the container." disabled={disabled} onClick={() => void onRun('redeploy')} /><Operation icon={ArchiveRestore} title="Create backup" copy="Archive the exact source checkout used for this build." disabled={disabled} onClick={() => void onRun('backup')} /><Operation icon={ShieldCheck} title="Verify source" copy="Confirm the repository branch and local package definition are readable." disabled={disabled} onClick={() => void onRun('scan')} /><Operation icon={RotateCw} title="Restart container" copy="Restart the Nginx application container without rebuilding." disabled={disabled} onClick={() => void onRun('restart')} />{site.lovableBuildUrl && <a className="operation-card" href={site.lovableBuildUrl} target="_blank" rel="noreferrer"><span><Sparkles aria-hidden="true" /></span><strong>Continue in Lovable</strong><small>Open the original Build with URL prompt for further generation.</small><em>Open Lovable<ExternalLink aria-hidden="true" /></em></a>}</> : <><Operation icon={RefreshCw} title="Refresh inventory" copy="Read live core, plugin, theme and PHP versions." disabled={disabled} onClick={() => void onRun('refresh')} /><Operation icon={Upload} title="Update everything" copy="Back up, then update WordPress core, all plugins and all themes." disabled={disabled} onClick={() => void onRun('update')} /><Operation icon={ArchiveRestore} title="Create backup" copy="Export MariaDB and archive the WordPress volume." disabled={disabled} onClick={() => void onRun('backup')} /><Operation icon={ShieldCheck} title="Verify checksums" copy="Validate WordPress core and available plugin checksums." disabled={disabled} onClick={() => void onRun('scan')} /><Operation icon={RotateCw} title="Restart containers" copy="Restart MariaDB and WordPress in dependency order." disabled={disabled} onClick={() => void onRun('restart')} /><Operation icon={LogIn} title="One-click WP Admin" copy="Issue a one-time, 60-second administrator session." disabled={disabled} onClick={onLogin} /></>}</div></section><section className="content-card tool-details"><div className="card-title"><div><small>RUNTIME DETAILS</small><h2>Container endpoints</h2></div></div><div className="definition-grid"><span><small>{isLovable ? 'Application' : 'WordPress'}</small><strong>{site.containerName}</strong></span><span><small>{isLovable ? 'Source branch' : 'MariaDB'}</small><strong>{isLovable ? site.repositoryBranch || 'main' : site.databaseContainer}</strong></span><span><small>Image</small><strong>{site.image}</strong></span><span><small>Container ID</small><strong>{site.containerId || '—'}</strong></span><span><small>Domain</small><strong>{site.siteUrl}</strong></span><span><small>Local preview</small><strong>{site.directUrl || '—'}</strong></span></div></section><section className="danger-zone"><div><strong>Remove site</strong><p>{isLovable ? 'Deletes the application container, built image, local source checkout and backups.' : 'Deletes both containers, their named volumes and local backups.'}</p></div><button disabled={disabled} onClick={() => void onRun('delete', { deleteData: true })}>Delete site and data</button></section></>;
}

function Operation({ icon: Icon, title, copy, disabled, onClick }: { icon: LucideIcon; title: string; copy: string; disabled: boolean; onClick: () => void }) { return <button className="operation-card" disabled={disabled} onClick={onClick}><span><Icon aria-hidden="true" /></span><strong>{title}</strong><small>{copy}</small><em>Run operation<ArrowRight aria-hidden="true" /></em></button>; }
function ActivityView({ entries }: { entries: ActivityEntry[] }) { return <><PageHeading eyebrow="AUDIT LOG" title="Activity" description="Completed and failed operations reported by the local Docker agent." /><section className="content-card"><ActivityList entries={entries} /></section></>; }
function ActivityList({ entries }: { entries: ActivityEntry[] }) { if (!entries.length) return <Empty title="No operations recorded" copy="Container launches and lifecycle actions will appear here." />; return <div className="timeline live-timeline">{entries.map((entry) => <div key={entry.id}><span className={`activity-dot ${entry.state === 'failed' ? 'red' : 'green'}`} /><span><strong>{entry.message}</strong><small>{entry.siteName} · {entry.type}</small></span><time>{relativeTime(entry.createdAt)}</time></div>)}</div>; }

function SettingsView({ system, onToast }: { system: SystemInfo; onToast: (message: string) => void }) {
  const [lovable, setLovable] = useState<LovableConnection>({ connected: false, account: null, workspaces: [], connectedAt: null });
  const [lovableLoading, setLovableLoading] = useState(true);
  const [lovableBusy, setLovableBusy] = useState(false);
  const [lovableError, setLovableError] = useState<string | null>(null);

  const refreshLovable = useCallback(async () => {
    const response = await fetch('/api/lovable', { cache: 'no-store' });
    const result = await response.json() as LovableConnection & { error?: string };
    if (!response.ok) throw new Error(result.error || 'Lovable connection status is unavailable.');
    setLovable(result);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      void refreshLovable().catch((failure) => {
        if (active) setLovableError(messageFrom(failure, 'Lovable connection status is unavailable.'));
      }).finally(() => { if (active) setLovableLoading(false); });
    });
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, [refreshLovable]);

  async function connectLovable() {
    const popup = window.open('about:blank', 'geekheros_lovable_oauth', 'popup,width=680,height=820');
    if (!popup) { setLovableError('Allow pop-ups for GeekHeros, then try again.'); return; }
    popup.opener = null;
    popup.document.title = 'Connecting Lovable';
    popup.document.body.textContent = 'Preparing a secure Lovable connection…';
    setLovableBusy(true); setLovableError(null);
    try {
      const response = await fetch('/api/lovable', { method: 'POST' });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error || 'Lovable did not start the connection.');
      popup.location.replace(result.authorizationUrl);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
        const connection = await refreshLovable();
        if (connection.connected) {
          popup.close();
          onToast(`Lovable connected${connection.account?.email ? ` as ${connection.account.email}` : ''}.`);
          return;
        }
      }
      throw new Error('Lovable did not finish connecting. Close the authorization window and try again.');
    } catch (failure) {
      popup.close();
      setLovableError(messageFrom(failure, 'Lovable could not be connected.'));
    } finally { setLovableBusy(false); }
  }

  async function disconnectLovableAccount() {
    setLovableBusy(true); setLovableError(null);
    try {
      const response = await fetch('/api/lovable', { method: 'DELETE' });
      const result = await response.json() as LovableConnection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Lovable could not be disconnected.');
      setLovable(result); onToast('Lovable was disconnected from GeekHeros.');
    } catch (failure) { setLovableError(messageFrom(failure, 'Lovable could not be disconnected.')); }
    finally { setLovableBusy(false); }
  }

  return <>
    <PageHeading eyebrow="LOCAL RUNTIME" title="Settings" description="The control plane is connected to Docker Desktop through a loopback-only agent." />
    <div className="settings-layout">
      <aside className="settings-nav">
        <button className="selected">Docker connection</button>
        <button disabled>HTTPS certificates</button>
        <button disabled>Remote nodes</button>
      </aside>
      <section className="settings-main">
        <div className="settings-section">
          <div><h2>Docker engine</h2><p>Live details reported by the engine receiving control-plane operations.</p></div>
          <div className="definition-grid">
            <span><small>Status</small><strong>{system.connected ? 'Connected' : 'Offline'}</strong></span>
            <span><small>Version</small><strong>{system.dockerVersion || '—'}</strong></span>
            <span><small>Operating system</small><strong>{system.operatingSystem || '—'}</strong></span>
            <span><small>Resources</small><strong>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)}</strong></span>
            <span><small>Agent</small><strong>{system.agent ? `${system.agent.host}:${system.agent.port}` : '—'}</strong></span>
            <span><small>Edge gateway</small><strong>{system.edge?.running ? 'Running' : 'Starts with first site'}</strong></span>
          </div>
        </div>
        <div className="settings-section">
          <div><h2>Lovable connection</h2><p>Authorize GeekHeros to create and manage projects through Lovable’s OAuth-protected MCP service.</p></div>
          <div className="connector-box lovable-connector">
            <span><Sparkles aria-hidden="true" /></span>
            <div>
              <strong>{lovable.connected ? lovable.account?.name || lovable.account?.email || 'Lovable connected' : 'Lovable'}</strong>
              <p>{lovable.connected ? lovable.account?.email || 'GeekHeros is authorized for this Lovable account.' : 'Connect your account so GeekHeros can create real Lovable projects.'}</p>
              <em>{lovableLoading ? 'Checking connection…' : lovable.connected ? `${lovable.workspaces.length} workspace${lovable.workspaces.length === 1 ? '' : 's'} available` : 'Not connected'}</em>
            </div>
            <div className="lovable-connector-actions">
              {lovable.connected && <a className="secondary-button link-button" href="https://lovable.dev" target="_blank" rel="noreferrer">Open Lovable<ExternalLink aria-hidden="true" /></a>}
              <button className={lovable.connected ? 'secondary-button' : 'primary-button'} disabled={lovableLoading || lovableBusy} onClick={() => void (lovable.connected ? disconnectLovableAccount() : connectLovable())}>
                <LogIn aria-hidden="true" />{lovableBusy ? 'Please wait…' : lovable.connected ? 'Disconnect' : 'Connect Lovable'}
              </button>
            </div>
          </div>
          {lovableError && <p className="connector-error" role="alert">{lovableError}</p>}
          <div className="setup-note lovable-setup-note"><span><Info aria-hidden="true" /></span><p>The authorization token stays in the ignored local GeekHeros state file and is never sent to the dashboard browser or stored in Docker labels.</p></div>
        </div>
        <div className="settings-section">
          <div><h2>Lovable build environment</h2><p>GeekHeros creates projects through Lovable’s connected MCP service, then clones the synced Git repository, runs a controlled Node 22 build and serves the static application through Nginx.</p></div>
          <div className="setup-note"><span><Info aria-hidden="true" /></span><p>GeekHeros deploys from the project’s GitHub or GitLab sync. Lovable authorization is never exposed to build containers.</p></div>
        </div>
        <div className="settings-section">
          <div><h2>One-click WordPress login</h2><p>GeekHeros installs a protected MU-plugin into managed sites. Login capabilities are random, single-use, expire after 60 seconds and are posted rather than placed in URLs.</p></div>
          <div className="setup-note"><span><Info aria-hidden="true" /></span><p>The MU-plugin cannot be deactivated from WordPress and hides the must-use plugin table from client administrators.</p></div>
        </div>
        <div className="settings-section">
          <div><h2>Domain routing</h2><p>Public domains need an A record pointing to this machine’s public IP, plus firewall/router forwarding for ports 80 and 443.</p></div>
          <div className="setup-note"><span><Info aria-hidden="true" /></span><p>Use a <code>.localhost</code> hostname for an immediate local test.</p></div>
        </div>
      </section>
    </div>
  </>;
}

function LaunchChoiceModal({ onClose, onChoose }: { onClose: () => void; onChoose: (kind: SiteKind) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal launch-choice-modal" role="dialog" aria-modal="true" aria-labelledby="launch-choice-title"><div className="modal-head"><div><p className="eyebrow">NEW DOCKER SITE</p><h2 id="launch-choice-title">Choose a site source</h2><p>Both options use the same GeekHeros clients, tags, container profiles, routing and lifecycle controls.</p></div><button onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button></div><div className="launch-choice-grid"><button onClick={() => onChoose('wordpress')}><span className="launch-choice-icon wordpress-choice"><Container aria-hidden="true" /></span><strong>WordPress</strong><p>Install WordPress and MariaDB with persistent volumes and one-click WP Admin.</p><em>Launch WordPress<ArrowRight aria-hidden="true" /></em></button><button onClick={() => onChoose('lovable')}><span className="launch-choice-icon lovable-choice"><Sparkles aria-hidden="true" /></span><strong>Lovable build</strong><p>Generate in Lovable, sync to Git, then build and host the Vite application here.</p><em>Launch Lovable<ArrowRight aria-hidden="true" /></em></button></div></section></div>; }

function WordPressLaunchModal({ clients, blueprints, defaultBlueprintId, busy, onBack, onClose, onSubmit }: { clients: Client[]; blueprints: Blueprint[]; defaultBlueprintId: string; busy: boolean; onBack: () => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><div className="modal-head"><div><p className="eyebrow">WORDPRESS WORKLOAD</p><h2 id="launch-title">Launch WordPress</h2><p>Creates isolated WordPress and MariaDB containers, persistent volumes, networking and edge routing.</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={onSubmit}><input type="hidden" name="kind" value="wordpress" /><div className="form-grid"><label>Site name<input name="name" required maxLength={80} placeholder="Client marketing site" autoFocus /></label><label>Domain<input name="domain" required placeholder="client.localhost" /></label><label>Client<select name="clientId" defaultValue=""><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Container profile<select name="pod" defaultValue="Standard"><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select></label><label className="full-field">Tags<input name="tags" placeholder="production, managed, ecommerce" /></label><label className="full-field">WordPress blueprint<select name="blueprintId" defaultValue={defaultBlueprintId}><option value="">Default — Clean WordPress install</option>{blueprints.map((blueprint) => <option value={blueprint.id} key={blueprint.id}>{blueprint.name} — {blueprintItemCount(blueprint)} setup item{blueprintItemCount(blueprint) === 1 ? '' : 's'}</option>)}</select><small>Choose Default for a clean installation, or apply a saved package before the site becomes available.</small></label><label>Administrator username<input name="adminUser" required defaultValue="admin" autoComplete="username" /></label><label>Administrator email<input name="adminEmail" type="email" required placeholder="admin@example.com" autoComplete="email" /></label><label className="full-field">Administrator password<input name="adminPassword" type="password" required minLength={12} placeholder="At least 12 characters" autoComplete="new-password" /></label></div><div className="launch-footnote"><span><Info aria-hidden="true" /></span><p>The password is used during installation and is not exposed in Docker labels or activity logs. Blueprint files stay on this machine and are copied into the new WordPress volume during setup.</p></div><div className="modal-actions"><button type="button" className="secondary-button back-choice" onClick={onBack} disabled={busy}><ArrowLeft aria-hidden="true" />Change source</button><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Starting containers…' : 'Launch WordPress'}</button></div></form></section></div>; }

function LovableLaunchModal({ clients, busy, onBack, onClose, onOpenSettings, onSubmit }: { clients: Client[]; busy: boolean; onBack: () => void; onClose: () => void; onOpenSettings: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [connection, setConnection] = useState<LovableConnection>({ connected: false, account: null, workspaces: [], connectedAt: null });
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/lovable', { cache: 'no-store' }).then(async (response) => {
      const result = await response.json() as LovableConnection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Lovable connection status is unavailable.');
      if (active) setConnection(result);
    }).catch((failure) => { if (active) setConnectionError(messageFrom(failure, 'Lovable connection status is unavailable.')); })
      .finally(() => { if (active) setConnectionLoading(false); });
    return () => { active = false; };
  }, []);

  const locked = busy;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !locked) onClose(); }}>
    <section className="modal lovable-launch-modal" role="dialog" aria-modal="true" aria-labelledby="lovable-launch-title">
      <div className="modal-head"><div><p className="eyebrow">LOVABLE WORKLOAD</p><h2 id="lovable-launch-title">Build with Lovable</h2><p>Create the project through your linked Lovable account, sync it to Git, then let GeekHeros build and host it in Docker.</p></div><button onClick={onClose} disabled={locked} aria-label="Close"><X aria-hidden="true" /></button></div>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="kind" value="lovable" />
        <div className="lovable-workflow"><span>1</span><p><strong>Generate</strong>Create the project through the linked Lovable account.</p><span>2</span><p><strong>Sync</strong>Connect that Lovable project to GitHub or GitLab.</p><span>3</span><p><strong>Host</strong>Paste the repository below and launch its container.</p></div>
        <div className="form-grid">
          <label>Site name<input name="name" required maxLength={80} placeholder="Client web application" autoFocus /></label>
          <label>Domain<input name="domain" required placeholder="app.client.localhost" /></label>
          <label>Client<select name="clientId" defaultValue=""><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
          <label>Container profile<select name="pod" defaultValue="Standard"><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select></label>
          <label className="full-field">Tags<input name="tags" placeholder="production, lovable, application" /></label>
          <label className="full-field">Lovable prompt<textarea name="lovablePrompt" required maxLength={50000} rows={5} placeholder="Describe the application, pages, features and visual direction Lovable should build." /></label>
          <label>Reference image URLs<textarea name="imageUrls" rows={3} placeholder="https://example.com/logo.png" /><small>JPEG, PNG or WebP. One public URL per line.</small></label>
          <label>Reference page URLs<textarea name="htmlUrls" rows={3} placeholder="https://example.com/reference-page" /><small>Public pages only. Ten combined references maximum.</small></label>
          {!connection.connected && <div className="full-field lovable-builder-action"><button type="button" className="secondary-button" disabled={connectionLoading} onClick={onOpenSettings}><LogIn aria-hidden="true" />{connectionLoading ? 'Checking Lovable…' : 'Connect Lovable in Settings'}</button><span>Connect Lovable from Settings before using the generated prompt.</span>{connectionError && <strong className="connector-error" role="alert">{connectionError}</strong>}</div>}
          <label className="full-field">Git repository URL<input name="repositoryUrl" type="url" required placeholder="https://github.com/your-account/lovable-project" /><small>Use the repository Lovable creates through Git sync.</small></label>
          <label>Branch<input name="repositoryBranch" defaultValue="main" required /></label>
          <label>Repository access token<input name="repositoryToken" type="password" autoComplete="off" placeholder="Optional for private repos" /><small>Stored only in the local GeekHeros agent state.</small></label>
          <label className="full-field">Frontend build variables<textarea name="buildEnvironment" rows={4} placeholder={'VITE_SUPABASE_URL=https://…\nVITE_SUPABASE_PUBLISHABLE_KEY=…'} /><small>Optional VITE_ variables, one KEY=value per line. These values are compiled into the browser bundle, so do not use server secrets.</small></label>
        </div>
        <div className="launch-footnote"><span><Info aria-hidden="true" /></span><p>GeekHeros uses a controlled Node 22 build and Nginx runtime. The repository’s Dockerfile is not executed.</p></div>
        <div className="modal-actions"><button type="button" className="secondary-button back-choice" onClick={onBack} disabled={locked}><ArrowLeft aria-hidden="true" />Change source</button><button type="button" className="secondary-button" onClick={onClose} disabled={locked}>Cancel</button><button className="primary-button" disabled={locked}>{busy ? 'Building container…' : 'Build & launch'}</button></div>
      </form>
    </section>
  </div>;
}

function BlueprintModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: BlueprintInput) => Promise<void> }) {
  const [uploads, setUploads] = useState<BlueprintUpload[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = busy || preparing;

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const next = [...uploads];
    for (const file of Array.from(files)) {
      if (next.length >= 25) { setError('A blueprint may contain up to 25 uploaded files.'); break; }
      if (file.size > 25 * 1024 * 1024) { setError(`${file.name} is larger than the 25 MB per-file limit.`); continue; }
      const kind = inferBlueprintFileKind(file.name);
      next.push({ id: window.crypto.randomUUID(), file, kind, destination: `wp-content/blueprint-files/${file.name}` });
    }
    if (next.reduce((sum, upload) => sum + upload.file.size, 0) > 75 * 1024 * 1024) { setError('Blueprint uploads may total up to 75 MB.'); return; }
    setUploads(next);
  }

  function updateUpload(id: string, patch: Partial<Pick<BlueprintUpload, 'kind' | 'destination'>>) {
    setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, ...patch } : upload));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPreparing(true); setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const files: BlueprintInput['files'] = [];
      for (const upload of uploads) files.push({ name: upload.file.name, kind: upload.kind, destination: upload.kind === 'wp-content' ? upload.destination : '', content: await fileToBase64(upload.file) });
      await onSubmit({
        name: String(form.get('name') || ''),
        description: String(form.get('description') || ''),
        plugins: splitBlueprintSlugs(String(form.get('plugins') || '')),
        themes: splitBlueprintSlugs(String(form.get('themes') || '')),
        files,
      });
    } catch (failure) { setError(messageFrom(failure, 'The blueprint could not be saved.')); }
    finally { setPreparing(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !locked) onClose(); }}><section className="modal blueprint-modal" role="dialog" aria-modal="true" aria-labelledby="blueprint-modal-title"><div className="modal-head"><div><p className="eyebrow">WORDPRESS STARTER</p><h2 id="blueprint-modal-title">Add blueprint</h2><p>Bundle the packages and configuration that turn a clean WordPress install into your standard starting point.</p></div><button onClick={onClose} disabled={locked} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={submit}><div className="form-grid"><label>Blueprint name<input name="name" required maxLength={100} placeholder="Agency marketing starter" autoFocus /></label><label>Description<input name="description" maxLength={500} placeholder="SEO, forms, security and base pages" /></label><label>WordPress.org plugin slugs<textarea name="plugins" rows={4} placeholder={'wordpress-seo\nwordfence\nwpforms-lite'} /><small>For WordPress.org catalog plugins only. Do not add a slug for a plugin ZIP uploaded below.</small></label><label>WordPress.org theme slugs<textarea name="themes" rows={4} placeholder="astra" /><small>For WordPress.org catalog themes only. Do not add a slug for a theme ZIP uploaded below.</small></label><label className="full-field blueprint-upload"><span>Blueprint files</span><input type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} /><small>Add plugin or theme ZIPs, settings JSON, WordPress export XML, must-use plugin PHP, or any file that belongs under wp-content.</small></label><div className="full-field blueprint-upload-list">{uploads.map((upload) => <div className="blueprint-upload-row" key={upload.id}><span><strong>{upload.file.name}</strong><small>{formatBytes(upload.file.size)}</small></span><select aria-label={`Purpose for ${upload.file.name}`} value={upload.kind} onChange={(event) => updateUpload(upload.id, { kind: event.target.value as BlueprintFileKind })}>{blueprintKindsForFile(upload.file.name).map((kind) => <option key={kind} value={kind}>{blueprintFileKindLabel(kind)}</option>)}</select>{upload.kind === 'wp-content' && <input aria-label={`Destination for ${upload.file.name}`} value={upload.destination} onChange={(event) => updateUpload(upload.id, { destination: event.target.value })} placeholder={`wp-content/blueprint-files/${upload.file.name}`} />}<button type="button" onClick={() => setUploads((current) => current.filter((item) => item.id !== upload.id))} aria-label={`Remove ${upload.file.name}`}><X aria-hidden="true" /></button></div>)}{!uploads.length && <p>No files selected. You can still create a blueprint from WordPress.org plugin or theme slugs.</p>}</div></div><div className="blueprint-json-note"><Info aria-hidden="true" /><p><strong>Settings JSON format</strong>Use the top-level fields <code>options</code>, <code>plugins</code>, <code>themes</code> and <code>pages</code>. Unknown fields are rejected so a bad export cannot silently misconfigure a launch.</p><button type="button" onClick={downloadBlueprintSettingsExample}>Download example JSON</button></div>{error && <p className="blueprint-form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={locked}>Cancel</button><button className="primary-button" disabled={locked}>{locked ? 'Saving blueprint…' : 'Add blueprint'}</button></div></form></section></div>;
}

function ClientModal({ client, busy, onClose, onSubmit }: { client: Client | null; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="client-title"><div className="modal-head"><div><p className="eyebrow">CLIENT RECORD</p><h2 id="client-title">{client ? 'Edit client' : 'Add client'}</h2><p>{client ? 'Update the client record without changing its assigned sites.' : 'Create an empty client record, then assign real sites to it.'}</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Client name<input name="name" required maxLength={100} defaultValue={client?.name || ''} autoFocus /></label><label>Company<input name="company" maxLength={120} defaultValue={client?.company || ''} /></label><label>Email<input name="email" type="email" maxLength={160} defaultValue={client?.email || ''} /></label><label>Phone<input name="phone" maxLength={60} defaultValue={client?.phone || ''} /></label><label className="full-field">Notes<textarea name="notes" maxLength={1000} rows={4} defaultValue={client?.notes || ''} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save client'}</button></div></form></section></div>; }

function Status({ site }: { site: Site }) { const tone = site.status.toLowerCase().replace(/[^a-z]+/g, '-'); return <span className={`status-pill ${tone}`}><i />{site.phase || site.status}</span>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="empty-state"><strong>{title}</strong><span>{copy}</span></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase(); }
function humanizeSlug(value: string) { return value.split(/[-_]/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
function splitBlueprintSlugs(value: string) { return [...new Set(value.split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))]; }
function inferBlueprintFileKind(name: string): BlueprintFileKind { const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0]; return extension === '.zip' ? 'plugin' : extension === '.json' ? 'settings' : extension === '.xml' ? 'content' : extension === '.php' ? 'mu-plugin' : 'wp-content'; }
function blueprintKindsForFile(name: string): BlueprintFileKind[] { const inferred = inferBlueprintFileKind(name); return inferred === 'plugin' ? ['plugin', 'theme', 'wp-content'] : inferred === 'settings' ? ['settings', 'wp-content'] : inferred === 'content' ? ['content', 'wp-content'] : inferred === 'mu-plugin' ? ['mu-plugin', 'wp-content'] : ['wp-content']; }
function blueprintFileKindLabel(kind: BlueprintFileKind) { return ({ plugin: 'Plugin ZIP', theme: 'Theme ZIP', settings: 'Settings JSON', content: 'WordPress export XML', 'mu-plugin': 'Must-use plugin', 'wp-content': 'wp-content file' } as const)[kind]; }
function blueprintItemCount(blueprint: Blueprint) { return blueprint.plugins.length + blueprint.themes.length + blueprint.fileCount; }
function fileToBase64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(`${file.name} could not be read.`)); reader.onload = () => { const result = String(reader.result || ''); const separator = result.indexOf(','); if (separator < 0) reject(new Error(`${file.name} could not be encoded.`)); else resolve(result.slice(separator + 1)); }; reader.readAsDataURL(file); }); }
function downloadBlueprintSettingsExample() { const example = { options: { blogdescription: 'A concise site tagline', timezone_string: 'America/Los_Angeles', default_comment_status: 'closed' }, plugins: [{ slug: 'wordpress-seo', activate: true }], themes: [{ slug: 'astra', activate: true }], pages: [{ title: 'Home', slug: 'home', status: 'publish', content: '<h1>Welcome</h1>' }] }; const url = URL.createObjectURL(new Blob([`${JSON.stringify(example, null, 2)}\n`], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'geekheros-blueprint-settings.json'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
function shortRevision(value: string | null) { return value ? value.slice(0, 8) : 'Not deployed'; }
function formatBytes(value: number) { if (!value) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function messageFrom(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
function operationLabel(type: string) { return ({ start: 'start', stop: 'stop', restart: 'restart', refresh: 'inventory refresh', backup: 'backup', update: 'full update', redeploy: 'source deployment', 'update-core': 'core update', 'update-plugins': 'plugin update', 'update-themes': 'theme update', 'activate-plugin': 'plugin activation', 'deactivate-plugin': 'plugin deactivation', 'activate-theme': 'theme activation', scan: 'checksum scan', delete: 'deletion' } as Record<string, string>)[type] || type; }
