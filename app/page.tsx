'use client';
/* eslint-disable @next/next/no-img-element -- authenticated local screenshots must bypass the image optimizer */

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArchiveRestore, ArrowLeft, ArrowRight, Bot, Boxes, Camera, Check, ChevronDown, ChevronRight, CircleAlert,
  ChartNoAxesCombined, CirclePlay, Clock3, Container, Copy, Database, Download, ExternalLink, FileCode2, FlaskConical, Gauge, GitCommit,
  Globe2, House, Info, LogIn, Logs, Package, Play, Plus, Radio, RefreshCw, Rocket, RotateCcw, RotateCw, Search,
  ServerCog, Settings, ShieldCheck, ShieldOff, Sparkles, Square, Terminal, Trash2, Undo2, Upload, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type View = 'Overview' | 'Sites' | 'Staging' | 'Clients' | 'Blueprints' | 'Agents' | 'Analytics' | 'Activity' | 'Settings';
type Filter = 'All' | 'Running' | 'Attention';
type SiteTab = 'Overview' | 'Updates' | 'Backups' | 'Tools';
type SiteKind = 'wordpress' | 'lovable';
type LaunchMode = 'choose' | SiteKind | null;
type BackupMode = 'manual' | 'automatic';

type UpdateCounts = { core: number; plugins: number; themes: number };
type BackupPolicy = {
  mode: BackupMode; intervalHours: number; lastAutomaticBackupAt: string | null; nextBackupAt: string | null;
  lastAttemptAt: string | null; lastError: string | null; updatedAt: string | null;
};
type Site = {
  id: string; name: string; domain: string; status: string; phase: string | null; error: string | null;
  kind: SiteKind;
  clientId: string | null; tags: string[]; region: string; pod: string; wp: string; php: string;
  updates: number; updateCounts: UpdateCounts; uptime: string; createdAt: string; updatedAt: string;
  containerId: string | null; containerName: string; databaseContainer: string; image: string;
  directUrl: string | null; siteUrl: string; adminUrl: string | null; backupCount: number;
  backups: Backup[]; lastBackupAt: string | null; lastScannedAt: string | null; backupPolicy: BackupPolicy | null;
  repositoryUrl: string | null; repositoryBranch: string | null; sourceRevision: string | null;
  sourceProvider: 'lovable' | 'git' | null; lovableProjectId: string | null; lovableWorkspaceId: string | null;
  lovableBuildUrl: string | null;
  blueprintId: string | null; blueprintName: string | null; blueprintAppliedAt: string | null;
  environment: 'production' | 'staging'; productionSiteId: string | null; lastSyncedAt: string | null;
  lastPromotedAt: string | null; syncSourceUpdatedAt: string | null;
  screenshot: { capturedAt: string; width: number; height: number } | null;
  monitoring: { lastCheck: MonitoringCheck | null; uptimePercent: number | null; averageLatencyMs: number | null; checkCount: number };
};
type MonitoringCheck = { checkedAt: string; ok: boolean; statusCode: number | null; latencyMs: number | null; error: string | null };
type Client = {
  id: string; name: string; company: string; email: string; phone: string; notes: string;
  siteCount: number; runningSiteCount: number; createdAt: string; updatedAt: string;
};
type PackageItem = {
  name: string; status: string; version: string; update: string; updateVersion: string | null; autoUpdate: string;
};
type Backup = { id: string; createdAt: string; trigger?: 'manual' | 'automatic' | 'system'; files: string[] };
type BackupHistoryEntry = Backup & { sourceSiteId: string; sourceSiteName: string; sourceEnvironment: 'production' | 'staging' };
type BackupDestination = { id: string; name: string; domain: string; environment: 'production' | 'staging'; status: string; phase: string | null };
type BackupHistory = { siteId: string; familyId: string; backups: BackupHistoryEntry[]; destinations: BackupDestination[] };
type Inventory = {
  readAt: string; core: { version: string; update: { version: string; updateType: string } | null };
  plugins: PackageItem[]; themes: PackageItem[]; updates: UpdateCounts; backups: Backup[];
};
type SystemInfo = {
  connected: boolean; dockerVersion?: string; operatingSystem?: string; cpuCount?: number; memoryBytes?: number;
  totalContainers?: number; runningContainers?: number; managedSites?: number; runningSites?: number;
  provisioningSites?: number; attentionSites?: number; productionSites?: number; stagingSites?: number;
  edge?: { installed: boolean; running: boolean; container: string; httpPort: number; httpsPort: number };
  agent?: { host: string; port: number }; error?: string;
  mcp?: { enabled: boolean; url: string; toolCount: number; config: Record<string, unknown> };
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
type BlueprintFileSource = { provider: 'wordpress.org'; slug: string; name: string; version: string; pluginUrl: string; downloadedAt: string; libraryPluginId: string | null };
type BlueprintFile = { id: string; name: string; kind: BlueprintFileKind; destination: string; size: number; sha256: string; source: BlueprintFileSource | null };
type BlueprintPackage = { slug: string; activate: boolean };
type Blueprint = {
  id: string; name: string; description: string; plugins: BlueprintPackage[]; themes: BlueprintPackage[];
  files: BlueprintFile[]; fileCount: number; totalBytes: number; usageCount: number; createdAt: string; updatedAt: string;
};
type BlueprintUpload = { id: string; file: File; kind: BlueprintFileKind; destination: string };
type BlueprintInput = { name: string; description: string; plugins: string[]; themes: string[]; libraryPluginIds: string[]; retainedFileIds: string[]; files: Array<{ name: string; kind: BlueprintFileKind; destination: string; content: string }> };
type WordPressPlugin = {
  name: string; slug: string; version: string; author: string; shortDescription: string; rating: number;
  ratingCount: number; activeInstalls: number; requiresWordPress: string; testedWordPress: string;
  requiresPhp: string; lastUpdated: string; pluginUrl: string;
};
type WordPressPluginSearch = { query: string; page: number; pages: number; total: number; plugins: WordPressPlugin[]; searchedAt: string };
type PluginLibraryItem = WordPressPlugin & { id: string; fileName: string; size: number; sha256: string; downloadedAt: string };
type McpAgent = {
  id: string; name: string; clientName: string | null; clientTitle: string | null; clientVersion: string | null;
  protocolVersion: string | null; capabilities: string[]; ip: string; local: boolean; platform: string;
  userAgent: string; origin: string | null; remotePort: number | null; sessionIdHash: string | null; transport: string;
  status: 'Connected' | 'Idle' | 'Offline' | 'Restarting' | 'Removed'; firstSeenAt: string; connectedAt: string;
  lastSeenAt: string | null; lastMethod: string | null; lastTool: string | null; requestCount: number;
  toolCallCount: number; errorCount: number; deniedCount: number; restartCount: number;
  lastResponseStatus: number | null; lastLatencyMs: number | null; averageLatencyMs: number | null;
  restartRequestedAt: string | null; revokedAt: string | null;
};
type AnalyticsRangeDays = 1 | 7 | 30 | 90;
type AnalyticsEnvironment = 'all' | 'production' | 'staging';
type AnalyticsKind = 'all' | 'wordpress' | 'lovable';
type AnalyticsSeriesPoint = {
  bucketStart: string; bucketEnd: string; checkCount: number; uptimePercent: number | null;
  averageLatencyMs: number | null; p95LatencyMs: number | null; failedChecks: number;
  operations: number; failedOperations: number; backups: number;
};
type SiteAnalyticsMetric = {
  id: string; name: string; domain: string; kind: SiteKind; environment: 'production' | 'staging'; status: string;
  uptimePercent: number | null; averageLatencyMs: number | null; p95LatencyMs: number | null;
  checkCount: number; failedChecks: number; operationCount: number; failedOperations: number;
  backupCount: number; updates: number; lastCheckAt: string | null; lastBackupAt: string | null;
};
type AnalyticsCheck = MonitoringCheck & {
  siteId: string; siteName: string; domain: string; environment: 'production' | 'staging'; kind: SiteKind;
};
type AnalyticsData = {
  generatedAt: string;
  range: { days: AnalyticsRangeDays; startAt: string; endAt: string; bucket: 'hour' | 'day' };
  filters: { siteId: string | null; environment: AnalyticsEnvironment; kind: AnalyticsKind };
  provenance: {
    mode: 'observed-only'; simulatedRecords: 0; monitoringChecks: number;
    activityEntries: number; backups: number; currentContainerInspections: number;
  };
  summary: {
    siteCount: number; runningSites: number; attentionSites: number; availabilityPercent: number | null;
    averageLatencyMs: number | null; p95LatencyMs: number | null; checkCount: number; failedChecks: number;
    operationCount: number; failedOperations: number; operationSuccessPercent: number | null;
    backupCount: number; availableUpdates: number;
  };
  series: AnalyticsSeriesPoint[];
  statusBreakdown: Array<{ status: string; count: number }>;
  siteMetrics: SiteAnalyticsMetric[];
  recentChecks: AnalyticsCheck[];
  operationTypes: Array<{ type: string; count: number; failures: number }>;
};

const nav: Array<{ view: View; icon: LucideIcon; subnav?: boolean }> = [
  { view: 'Overview', icon: House }, { view: 'Sites', icon: Container }, { view: 'Staging', icon: FlaskConical, subnav: true }, { view: 'Clients', icon: Users },
  { view: 'Blueprints', icon: Boxes },
  { view: 'Agents', icon: Bot },
  { view: 'Analytics', icon: ChartNoAxesCombined },
  { view: 'Activity', icon: Activity }, { view: 'Settings', icon: Settings },
];

const backupIntervalOptions = [
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Daily' },
  { hours: 72, label: 'Every 3 days' },
  { hours: 168, label: 'Weekly' },
  { hours: 720, label: 'Monthly' },
];
const defaultBackupPolicy: BackupPolicy = { mode: 'manual', intervalHours: 24, lastAutomaticBackupAt: null, nextBackupAt: null, lastAttemptAt: null, lastError: null, updatedAt: null };

const hostedDashboardHost = 'geekheros-control-plane.heroiccrm.chatgpt.site';
const localAgentOrigin = 'http://127.0.0.1:8788';

function usesLocalAgentBridge() {
  return typeof window !== 'undefined' && window.location.hostname === hostedDashboardHost;
}

function controlPlaneUrl(path: string) {
  if (!usesLocalAgentBridge()) return path;
  return `${localAgentOrigin}${path.startsWith('/api/') ? path.slice(4) : path}`;
}

function apiFetch(path: string, init: RequestInit = {}) {
  if (!usesLocalAgentBridge()) return fetch(path, init);
  return fetch(controlPlaneUrl(path), {
    ...init,
    mode: 'cors',
    cache: init.cache || 'no-store',
    targetAddressSpace: 'loopback',
  } as RequestInit);
}

export default function Home() {
  const [view, setView] = useState<View>('Sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [stagingSites, setStagingSites] = useState<Site[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [pluginLibrary, setPluginLibrary] = useState<PluginLibraryItem[]>([]);
  const [agents, setAgents] = useState<McpAgent[]>([]);
  const [system, setSystem] = useState<SystemInfo>({ connected: false });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [launchMode, setLaunchMode] = useState<LaunchMode>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<Blueprint | null>(null);
  const [pluginBrowserOpen, setPluginBrowserOpen] = useState(false);
  const [pluginBrowserBlueprintId, setPluginBrowserBlueprintId] = useState<string | null>(null);
  const [stagingOpen, setStagingOpen] = useState(false);
  const [preferredBlueprintId, setPreferredBlueprintId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [systemResponse, sitesResponse, stagingResponse, clientsResponse, blueprintsResponse, pluginLibraryResponse, agentsResponse, activityResponse] = await Promise.all([
        apiFetch('/api/system', { cache: 'no-store' }), apiFetch('/api/sites', { cache: 'no-store' }),
        apiFetch('/api/staging', { cache: 'no-store' }),
        apiFetch('/api/clients', { cache: 'no-store' }), apiFetch('/api/blueprints', { cache: 'no-store' }),
        apiFetch('/api/wordpress/plugins/library', { cache: 'no-store' }),
        apiFetch('/api/agents', { cache: 'no-store' }),
        apiFetch('/api/activity', { cache: 'no-store' }),
      ]);
      const [systemData, sitesData, stagingData, clientsData, blueprintsData, pluginLibraryData, agentsData, activityData] = await Promise.all([
        systemResponse.json().catch(() => ({ connected: false, error: 'Unable to read Docker status.' })),
        sitesResponse.json().catch(() => ({ sites: [] })), stagingResponse.json().catch(() => ({ staging: [] })),
        clientsResponse.json().catch(() => ({ clients: [] })),
        blueprintsResponse.json().catch(() => ({ blueprints: [] })),
        pluginLibraryResponse.json().catch(() => ({ plugins: [] })),
        agentsResponse.json().catch(() => ({ agents: [] })),
        activityResponse.json().catch(() => ({ activity: [] })),
      ]) as [SystemInfo, { sites?: Site[]; error?: string }, { staging?: Site[] }, { clients?: Client[] }, { blueprints?: Blueprint[] }, { plugins?: PluginLibraryItem[] }, { agents?: McpAgent[] }, { activity?: ActivityEntry[] }];
      setSystem(systemData);
      if (sitesResponse.ok) setSites(sitesData.sites || []);
      if (stagingResponse.ok) setStagingSites(stagingData.staging || []);
      if (clientsResponse.ok) setClients(clientsData.clients || []);
      if (blueprintsResponse.ok) setBlueprints(blueprintsData.blueprints || []);
      if (pluginLibraryResponse.ok) setPluginLibrary(pluginLibraryData.plugins || []);
      if (agentsResponse.ok) setAgents(agentsData.agents || []);
      if (activityResponse.ok) setActivity(activityData.activity || []);
      setError(systemResponse.ok ? null : systemData.error || sitesData.error || 'Docker Desktop agent is offline.');
    } catch {
      const message = usesLocalAgentBridge()
        ? 'Keep npm run dev open on this PC, allow Local Network Access when your browser asks, then retry.'
        : 'The local control plane briefly lost its connection. Keep npm run dev open, then retry.';
      setSystem((current) => ({ ...current, connected: false, error: message }));
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => void refresh(true), [...sites, ...stagingSites].some((site) => site.status === 'Provisioning') ? 3000 : 10000);
    return () => window.clearInterval(interval);
  }, [refresh, sites, stagingSites]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = [...sites, ...stagingSites].find((site) => site.id === selectedId) || null;
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const visibleSites = useMemo(() => sites.filter((site) => {
    const searchMatch = `${site.name} ${site.domain} ${site.kind} ${site.containerName} ${site.repositoryUrl || ''} ${site.repositoryBranch || ''} ${site.tags.join(' ')} ${site.clientId ? clientNames.get(site.clientId) || '' : ''}`.toLowerCase().includes(query.toLowerCase());
    const filterMatch = filter === 'All' || (filter === 'Running' ? site.status === 'Running' : site.status !== 'Running' || Boolean(site.error));
    return searchMatch && filterMatch;
  }), [clientNames, filter, query, sites]);
  const visibleStagingSites = useMemo(() => stagingSites.filter((site) => `${site.name} ${site.domain} ${site.containerName} ${site.tags.join(' ')} ${site.productionSiteId ? sites.find((production) => production.id === site.productionSiteId)?.name || '' : ''}`.toLowerCase().includes(query.toLowerCase())), [query, sites, stagingSites]);
  const visibleClients = useMemo(() => clients.filter((client) => `${client.name} ${client.company} ${client.email} ${client.phone}`.toLowerCase().includes(query.toLowerCase())), [clients, query]);
  const visibleBlueprints = useMemo(() => blueprints.filter((blueprint) => `${blueprint.name} ${blueprint.description} ${blueprint.plugins.map((plugin) => plugin.slug).join(' ')} ${blueprint.themes.map((theme) => theme.slug).join(' ')} ${blueprint.files.map((file) => file.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [blueprints, query]);
  const visibleAgents = useMemo(() => agents.filter((agent) => `${agent.name} ${agent.clientName || ''} ${agent.clientVersion || ''} ${agent.ip} ${agent.platform} ${agent.userAgent} ${agent.lastTool || ''}`.toLowerCase().includes(query.toLowerCase())), [agents, query]);

  function navigate(next: View) { setView(next); setSelectedId(null); }
  function openLaunch() { setPreferredBlueprintId(null); setLaunchMode('choose'); }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('create');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await apiFetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
      const response = await apiFetch(endpoint, { method: editingClient ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
      const response = await apiFetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The client could not be removed.');
      setToast(`${client.name} was removed. Sites were kept.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The client could not be removed.')); }
    finally { setBusy(null); }
  }

  async function createStaging(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('staging:create');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await apiFetch('/api/staging', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { staging?: Site; error?: string };
      if (!response.ok || !result.staging) throw new Error(result.error || 'The staging environment could not be created.');
      setStagingOpen(false); setView('Staging'); setSelectedId(result.staging.id);
      setToast(`${result.staging.name} is cloning production into isolated containers.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The staging environment could not be created.')); }
    finally { setBusy(null); }
  }

  async function manageStaging(site: Site, action: 'sync' | 'promote' | 'delete') {
    const production = sites.find((entry) => entry.id === site.productionSiteId);
    if (action === 'sync' && !window.confirm(`Refresh ${site.name} from ${production?.name || 'production'}? A staging recovery point will be created, then staging files and database will be replaced.`)) return;
    if (action === 'promote' && !window.confirm(`Push all staging files and database changes to ${production?.name || 'production'}? GeekHeros will create a production recovery point first.`)) return;
    if (action === 'delete' && !window.confirm(`Delete ${site.name}, including its isolated containers, volumes and backups? Production will not be changed.`)) return;
    setBusy(`staging:${site.id}:${action}`);
    try {
      const response = await apiFetch(`/api/staging/${encodeURIComponent(site.id)}/actions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, scope: 'all' }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `Staging ${action} failed.`);
      if (action === 'delete') setSelectedId(null);
      const message = action === 'sync' ? 'refreshed from production' : action === 'promote' ? 'promoted to production' : 'deleted';
      setToast(`${site.name} was ${message}.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, `Staging ${action} failed.`)); }
    finally { setBusy(null); }
  }

  async function saveBlueprint(input: BlueprintInput) {
    const blueprint = editingBlueprint;
    setBusy(blueprint ? `blueprint:${blueprint.id}:update` : 'blueprint:create');
    try {
      const endpoint = blueprint ? `/api/blueprints/${encodeURIComponent(blueprint.id)}` : '/api/blueprints';
      const response = await apiFetch(endpoint, { method: blueprint ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const result = await response.json() as { blueprint?: Blueprint; error?: string };
      if (!response.ok || !result.blueprint) throw new Error(result.error || 'The blueprint could not be saved.');
      setBlueprintOpen(false); setEditingBlueprint(null); setToast(`${result.blueprint.name} ${blueprint ? 'was updated' : 'is ready for WordPress launches'}.`); await refresh(true);
    } catch (failure) { throw new Error(messageFrom(failure, 'The blueprint could not be saved.')); }
    finally { setBusy(null); }
  }

  async function deleteBlueprint(blueprint: Blueprint) {
    if (!window.confirm(`Remove ${blueprint.name}? Existing sites are protected and will prevent removal.`)) return;
    setBusy(`blueprint:${blueprint.id}:delete`);
    try {
      const response = await apiFetch(`/api/blueprints/${encodeURIComponent(blueprint.id)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The blueprint could not be removed.');
      setToast(`${blueprint.name} was removed.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The blueprint could not be removed.')); }
    finally { setBusy(null); }
  }

  async function downloadWordPressPlugins(blueprintId: string | null, slugs: string[]) {
    setBusy('plugin-download');
    try {
      const response = await apiFetch('/api/wordpress/plugins/library', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blueprintId: blueprintId || undefined, slugs }),
      });
      const result = await response.json() as { plugins?: WordPressPlugin[]; blueprint?: Blueprint | null; error?: string };
      if (!response.ok || !result.plugins?.length) throw new Error(result.error || 'The plugins could not be downloaded.');
      const target = result.blueprint ? ` and added to ${result.blueprint.name}` : '';
      setToast(`${result.plugins.length} plugin${result.plugins.length === 1 ? '' : 's'} downloaded to the library${target}.`);
      await refresh(true);
      return true;
    } catch (failure) {
      setToast(messageFrom(failure, 'The plugins could not be downloaded.'));
      return false;
    } finally { setBusy(null); }
  }

  async function deleteLibraryPlugin(plugin: PluginLibraryItem) {
    if (!window.confirm(`Remove ${plugin.name} from the reusable plugin library? Existing blueprint copies and sites will not change.`)) return;
    setBusy(`plugin-library:${plugin.id}:delete`);
    try {
      const response = await apiFetch(`/api/wordpress/plugins/library/${encodeURIComponent(plugin.id)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The plugin could not be removed from the library.');
      setToast(`${plugin.name} was removed from the plugin library.`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, 'The plugin could not be removed from the library.')); }
    finally { setBusy(null); }
  }

  async function manageAgent(agent: McpAgent, action: 'restart' | 'remove' | 'restore' | 'forget') {
    if (action === 'remove' && !window.confirm(`Remove MCP access for ${agent.name}? Requests from this client fingerprint will be denied until you restore it.`)) return;
    if (action === 'forget' && !window.confirm(`Permanently forget the telemetry record for ${agent.name}? It can reappear only after access is restored and it reconnects.`)) return;
    setBusy(`agent:${agent.id}:${action}`);
    try {
      const response = await apiFetch(`/api/agents/${encodeURIComponent(agent.id)}/actions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `The agent ${action} action failed.`);
      const messages = { restart: 'Connection tracking restarted. The next request will appear as a fresh connection.', remove: 'MCP access removed.', restore: 'MCP access restored. The agent can reconnect.', forget: 'Agent telemetry forgotten.' };
      setToast(`${agent.name}: ${messages[action]}`); await refresh(true);
    } catch (failure) { setToast(messageFrom(failure, `The agent ${action} action failed.`)); }
    finally { setBusy(null); }
  }

  async function operate(site: Site, type: string, options: Record<string, unknown> = {}) {
    if (type === 'delete' && !window.confirm(`Delete ${site.name}, its containers, volumes and local backups? This cannot be undone.`)) return false;
    setBusy(`${site.id}:${type}`);
    try {
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}/operations`, {
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
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, tags }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Site details could not be saved.');
      setToast(`${site.name}: client and tags saved.`); await refresh(true); return true;
    } catch (failure) { setToast(messageFrom(failure, 'Site details could not be saved.')); return false; }
    finally { setBusy(null); }
  }

  async function restoreSiteBackup(sourceSiteId: string, backupId: string, targetSiteId: string, restoreScope: 'all' | 'files' | 'database') {
    const sourceSite = [...sites, ...stagingSites].find((site) => site.id === sourceSiteId);
    const targetSite = [...sites, ...stagingSites].find((site) => site.id === targetSiteId);
    if (!sourceSite) { setToast('The site that owns this backup is no longer available.'); return false; }
    if (!targetSite) { setToast('The selected restore destination is no longer available.'); return false; }
    setBusy('backup-restore');
    try {
      const response = await apiFetch(`/api/sites/${encodeURIComponent(sourceSite.id)}/operations`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'restore-backup', backupId, targetSiteId, restoreScope }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Backup restore failed.');
      setToast(`${targetSite.name}: backup restored from ${sourceSite.name}.`); await refresh(true); return true;
    } catch (failure) { setToast(messageFrom(failure, 'Backup restore failed.')); return false; }
    finally { setBusy(null); }
  }

  async function saveBackupSchedule(site: Site, mode: BackupMode, intervalHours: number) {
    setBusy(`${site.id}:backup-schedule`);
    try {
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}/backup-schedule`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, intervalHours }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The backup schedule could not be saved.');
      setToast(`${site.name}: ${mode === 'automatic' ? `automatic backups scheduled ${backupIntervalLabel(intervalHours).toLowerCase()}` : 'backups set to manual only'}.`);
      await refresh(true);
      return true;
    } catch (failure) { setToast(messageFrom(failure, 'The backup schedule could not be saved.')); return false; }
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
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}/login`, { method: 'POST' });
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
      <nav aria-label="Primary navigation"><p className="nav-label">Control plane</p>{nav.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-item ${item.subnav ? 'subnav' : ''} ${view === item.view && !selected ? 'active' : ''}`}><span><item.icon aria-hidden="true" /></span>{item.view}{item.view === 'Sites' && <em>{sites.length}</em>}{item.view === 'Staging' && <em>{stagingSites.length}</em>}{item.view === 'Clients' && <em>{clients.length}</em>}{item.view === 'Blueprints' && <em>{blueprints.length}</em>}{item.view === 'Agents' && <em>{agents.filter((agent) => agent.status === 'Connected').length}</em>}</button>)}</nav>
      <div className="node-card"><div className="node-card-head"><span>Managed fleet</span><strong>{system.runningSites || 0}/{system.managedSites || 0}</strong></div><div className="capacity-track"><span style={{ width: `${system.managedSites ? Math.round(((system.runningSites || 0) / system.managedSites) * 100) : 0}%` }} /></div><small>{system.cpuCount || 0} CPU · {formatBytes(system.memoryBytes || 0)} memory</small></div>
      <div className="sidebar-user"><span className="user-avatar">GH</span><span className="workspace-copy"><strong>Local administrator</strong><small>Docker access enabled</small></span></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><label className="global-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sites, staging, clients, blueprints and agents" /></label><div className={`top-actions ${system.connected ? '' : 'offline-copy'}`}><span className="live-dot" />{system.connected ? `Docker ${system.dockerVersion}` : 'Docker agent offline'}<button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw aria-hidden="true" /></button></div></header>
      {error && <div className="connection-banner"><span><CircleAlert aria-hidden="true" /></span><div><strong>Docker control is unavailable</strong><p>{error}</p></div><button onClick={() => void refresh()}>Retry connection</button></div>}
      {selected ? <SiteWorkspace key={selected.id} site={selected} clients={clients} backupHistoryRevision={[...sites, ...stagingSites].map((site) => `${site.id}:${site.backupCount}:${site.lastBackupAt || ''}`).join('|')} busy={busy} onBack={() => setSelectedId(null)} onOperate={operate} onRestoreBackup={restoreSiteBackup} onSaveMetadata={saveMetadata} onSaveBackupSchedule={saveBackupSchedule} onLogin={oneClickLogin} /> : <div className="page-content">
        {view === 'Overview' && <Overview sites={sites} clients={clients} system={system} activity={activity} onLaunch={openLaunch} onOpen={setSelectedId} />}
        {view === 'Sites' && <SitesView sites={visibleSites} clients={clients} total={sites.length} loading={loading} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onLaunch={openLaunch} onOpen={setSelectedId} />}
        {view === 'Staging' && <StagingView stagingSites={visibleStagingSites} productionSites={sites} busy={busy} onCreate={() => setStagingOpen(true)} onManage={manageStaging} onBackup={(site) => operate(site, 'backup')} onLogin={oneClickLogin} onOpen={setSelectedId} />}
        {view === 'Clients' && <ClientsView clients={visibleClients} sites={sites} busy={busy} onAdd={() => { setEditingClient(null); setClientOpen(true); }} onEdit={(client) => { setEditingClient(client); setClientOpen(true); }} onDelete={deleteClient} onOpenSite={setSelectedId} />}
        {view === 'Blueprints' && <BlueprintsView blueprints={visibleBlueprints} pluginLibrary={pluginLibrary} busy={busy} onAdd={() => { setEditingBlueprint(null); setBlueprintOpen(true); }} onEdit={(blueprint) => { setEditingBlueprint(blueprint); setBlueprintOpen(true); }} onBrowse={(blueprintId) => { setPluginBrowserBlueprintId(blueprintId); setPluginBrowserOpen(true); }} onDelete={deleteBlueprint} onDeleteLibraryPlugin={deleteLibraryPlugin} onLaunch={(blueprintId) => { setPreferredBlueprintId(blueprintId); setLaunchMode('wordpress'); }} />}
        {view === 'Agents' && <AgentsView agents={visibleAgents} allAgents={agents} busy={busy} onManage={manageAgent} onRefresh={() => void refresh(true)} />}
        {view === 'Analytics' && <AnalyticsView sites={[...sites, ...stagingSites]} onOpen={setSelectedId} />}
        {view === 'Activity' && <ActivityView entries={activity} />}
        {view === 'Settings' && <SettingsView system={system} onToast={setToast} />}
      </div>}
    </section>
    {launchMode === 'choose' && <LaunchChoiceModal onClose={() => setLaunchMode(null)} onChoose={(kind) => { setPreferredBlueprintId(null); setLaunchMode(kind); }} />}
    {launchMode === 'wordpress' && <WordPressLaunchModal clients={clients} blueprints={blueprints} defaultBlueprintId={preferredBlueprintId || ''} busy={busy === 'create'} onBack={() => setLaunchMode('choose')} onClose={() => setLaunchMode(null)} onSubmit={createSite} />}
    {launchMode === 'lovable' && <LovableLaunchModal clients={clients} busy={busy === 'create'} onBack={() => setLaunchMode('choose')} onClose={() => setLaunchMode(null)} onOpenSettings={() => { setLaunchMode(null); navigate('Settings'); }} onSubmit={createSite} />}
    {clientOpen && <ClientModal client={editingClient} busy={busy === 'client:save'} onClose={() => { setClientOpen(false); setEditingClient(null); }} onSubmit={createClient} />}
    {blueprintOpen && <BlueprintModal blueprint={editingBlueprint} pluginLibrary={pluginLibrary} busy={busy === 'blueprint:create' || busy === `blueprint:${editingBlueprint?.id}:update`} onClose={() => { setBlueprintOpen(false); setEditingBlueprint(null); }} onSubmit={saveBlueprint} />}
    {pluginBrowserOpen && <WordPressPluginRepositoryModal blueprints={blueprints} pluginLibrary={pluginLibrary} initialBlueprintId={pluginBrowserBlueprintId} busy={busy === 'plugin-download'} onClose={() => { setPluginBrowserOpen(false); setPluginBrowserBlueprintId(null); }} onDownload={downloadWordPressPlugins} />}
    {stagingOpen && <CreateStagingModal productionSites={sites.filter((site) => site.kind === 'wordpress' && !stagingSites.some((staging) => staging.productionSiteId === site.id))} busy={busy === 'staging:create'} onClose={() => setStagingOpen(false)} onSubmit={createStaging} />}
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
    <section className="fleet-panel"><div className="panel-toolbar"><div className="filter-tabs">{(['All', 'Running', 'Attention'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => onFilter(item)}>{item}</button>)}</div><label className="table-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search sites, clients or tags" /></label></div><div className="site-table" role="table"><div className="site-row table-header"><span>Site</span><span>Status</span><span>Client & tags</span><span>Workload</span><span>Uptime</span><span /></div>{sites.map((site) => <button className="site-row" key={site.id} onClick={() => onOpen(site.id)}><div className="site-cell"><span className="site-avatar">{initials(site.name)}</span><span><strong>{site.name}</strong><small>{site.domain}</small></span></div><Status site={site} /><span className="stacked"><strong>{site.clientId ? clientNames.get(site.clientId) || 'Unassigned' : 'Unassigned'}</strong><small>{site.tags.length ? site.tags.join(' · ') : 'No tags'}</small></span><span className="stacked"><strong>{site.kind === 'lovable' ? 'Lovable build' : site.wp === '—' ? 'Installing WordPress' : `WP ${site.wp}`}</strong><small>{site.kind === 'lovable' ? (site.sourceProvider === 'lovable' ? 'Direct Lovable source' : `${site.repositoryBranch || 'Auto-detect'} branch`) : `${site.updates} update${site.updates === 1 ? '' : 's'}`}</small></span><span className="uptime-cell"><strong>{site.uptime}</strong></span><span className="more-button"><ChevronRight aria-hidden="true" /></span></button>)}{!sites.length && <Empty title={loading ? 'Reading Docker Desktop…' : 'No managed sites yet'} copy={loading ? 'Live container state will appear here.' : 'Launch a WordPress or Lovable workload into Docker Desktop.'} />}</div><footer className="panel-footer"><span>Showing {sites.length} of {total} managed sites</span><span>Docker state refreshes automatically</span></footer></section></>;
}

function StagingView({ stagingSites, productionSites, busy, onCreate, onManage, onBackup, onLogin, onOpen }: { stagingSites: Site[]; productionSites: Site[]; busy: string | null; onCreate: () => void; onManage: (site: Site, action: 'sync' | 'promote' | 'delete') => Promise<void>; onBackup: (site: Site) => Promise<boolean>; onLogin: (site: Site) => Promise<void>; onOpen: (id: string) => void }) {
  const running = stagingSites.filter((site) => site.status === 'Running').length;
  const backups = stagingSites.reduce((sum, site) => sum + site.backupCount, 0);
  const latestSync = stagingSites.map((site) => site.lastSyncedAt).filter(Boolean).sort().at(-1) || null;
  return <><PageHeading eyebrow="WORDPRESS WORKFLOW" title="Staging" description="Safely test WordPress changes in isolated Docker environments before pushing them to production." actions={<button className="primary-button" onClick={onCreate}><Plus aria-hidden="true" />Create staging</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={FlaskConical} tone="violet" label="Staging sites" value={String(stagingSites.length)} detail={`${productionSites.filter((site) => site.kind === 'wordpress').length} production WordPress site${productionSites.filter((site) => site.kind === 'wordpress').length === 1 ? '' : 's'}`} /><MetricCard icon={CirclePlay} tone="green" label="Running" value={String(running)} detail="Isolated environments available now" /><MetricCard icon={ArchiveRestore} tone="blue" label="Recovery points" value={String(backups)} detail="Staging backups stored locally" /><MetricCard icon={Clock3} tone="amber" label="Latest refresh" value={latestSync ? relativeTime(latestSync) : '—'} detail="Production copied into staging" /></div>
    <div className="staging-safety-note"><ShieldCheck aria-hidden="true" /><p><strong>Safe by default.</strong> Each staging site uses separate containers, database and volumes. Search engines are blocked, outbound email is suppressed, URLs are rewritten automatically, and every sync or promotion creates a recovery point first.</p></div>
    <section className="staging-grid">{stagingSites.map((site) => {
      const production = productionSites.find((entry) => entry.id === site.productionSiteId);
      const actionBusy = Boolean(busy?.includes(site.id)) || site.status === 'Provisioning';
      return <article className="staging-card" key={site.id}><div className="staging-card-head"><span className="staging-icon"><FlaskConical aria-hidden="true" /></span><div><small>STAGING ENVIRONMENT</small><h2>{site.name}</h2><a href={site.siteUrl} target="_blank" rel="noreferrer">{site.domain}<ExternalLink aria-hidden="true" /></a></div><Status site={site} /></div><div className="staging-route"><span><small>Production</small><strong>{production?.name || 'Missing production site'}</strong><em>{production?.domain || 'Unavailable'}</em></span><ArrowRight aria-hidden="true" /><span><small>Staging</small><strong>{site.name}</strong><em>{site.domain}</em></span></div>{site.error && <div className="staging-card-error"><CircleAlert aria-hidden="true" />{site.error}</div>}<div className="staging-meta"><span><small>Last production sync</small><strong>{site.lastSyncedAt ? relativeTime(site.lastSyncedAt) : 'Still cloning'}</strong></span><span><small>Last promotion</small><strong>{site.lastPromotedAt ? relativeTime(site.lastPromotedAt) : 'Never pushed live'}</strong></span><span><small>Recovery points</small><strong>{site.backupCount}</strong></span><span><small>Runtime</small><strong>WP {site.wp} · PHP {site.php}</strong></span></div><div className="staging-actions"><button className="secondary-button" disabled={actionBusy || !production} onClick={() => void onManage(site, 'sync')}><Download aria-hidden="true" />Sync from production</button><button className="primary-button" disabled={actionBusy || !production} onClick={() => void onManage(site, 'promote')}><Rocket aria-hidden="true" />Push to production</button><button className="secondary-button compact-action" disabled={actionBusy || site.status !== 'Running'} onClick={() => void onBackup(site)}><ArchiveRestore aria-hidden="true" />Back up now</button><button className="secondary-button compact-action" disabled={actionBusy || site.status !== 'Running'} onClick={() => void onLogin(site)}><LogIn aria-hidden="true" />WP Admin</button><button className="secondary-button compact-action" onClick={() => onOpen(site.id)}><ServerCog aria-hidden="true" />Manage</button><button className="staging-delete" disabled={actionBusy} onClick={() => void onManage(site, 'delete')} aria-label={`Delete ${site.name}`} title="Delete staging"><Trash2 aria-hidden="true" /></button></div></article>;
    })}{!stagingSites.length && <div className="staging-empty"><span><FlaskConical aria-hidden="true" /></span><h2>No staging environments yet</h2><p>Clone a production WordPress site to test plugins, themes, content and configuration without touching the live site.</p><button className="primary-button" onClick={onCreate} disabled={!productionSites.some((site) => site.kind === 'wordpress')}><Plus aria-hidden="true" />Create your first staging site</button>{!productionSites.some((site) => site.kind === 'wordpress') && <small>Launch a production WordPress site first.</small>}</div>}</section></>;
}

function ClientsView({ clients, sites, busy, onAdd, onEdit, onDelete, onOpenSite }: { clients: Client[]; sites: Site[]; busy: string | null; onAdd: () => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void; onOpenSite: (id: string) => void }) {
  const assigned = sites.filter((site) => site.clientId).length;
  return <><PageHeading eyebrow="CLIENT OWNERSHIP" title="Clients" description="Group real WordPress and Lovable sites by client without duplicate records." actions={<button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add client</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={Users} tone="blue" label="Clients" value={String(clients.length)} detail="Stored in the local control plane" /><MetricCard icon={Container} tone="green" label="Assigned sites" value={String(assigned)} detail={`${sites.length - assigned} currently unassigned`} /><MetricCard icon={CirclePlay} tone="violet" label="Client sites online" value={String(sites.filter((site) => site.clientId && site.status === 'Running').length)} detail="Live Docker state" /><MetricCard icon={Package} tone="amber" label="Client updates" value={String(sites.filter((site) => site.clientId).reduce((sum, site) => sum + site.updates, 0))} detail="Pending maintenance items" /></div>
    <section className="client-list-panel">{clients.map((client) => { const clientSites = sites.filter((site) => site.clientId === client.id); return <article className="client-record" key={client.id}><div className="client-record-head"><span className="client-avatar">{initials(client.name)}</span><div><h2>{client.name}</h2>{client.company && <p>{client.company}</p>}</div><div className="client-record-actions"><button onClick={() => onEdit(client)}>Edit</button><button className="quiet-danger" disabled={busy === `client:${client.id}:delete`} onClick={() => onDelete(client)}>Remove</button></div></div><div className="client-contact">{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}{client.phone && <span>{client.phone}</span>}{!client.email && !client.phone && <span>No contact details saved</span>}</div>{client.notes && <p className="client-notes">{client.notes}</p>}<div className="client-sites"><strong>{client.siteCount} site{client.siteCount === 1 ? '' : 's'}</strong>{clientSites.map((site) => <button key={site.id} onClick={() => onOpenSite(site.id)}><span>{site.name} · {site.kind === 'lovable' ? 'Lovable' : 'WordPress'}</span><Status site={site} /><em><ChevronRight aria-hidden="true" /></em></button>)}{!clientSites.length && <small>Assign a site from its Overview tab.</small>}</div></article>; })}{!clients.length && <Empty title="No clients yet" copy="Add a client, then assign existing WordPress or Lovable sites to it." />}</section></>;
}

function BlueprintsView({ blueprints, pluginLibrary, busy, onAdd, onEdit, onBrowse, onDelete, onDeleteLibraryPlugin, onLaunch }: { blueprints: Blueprint[]; pluginLibrary: PluginLibraryItem[]; busy: string | null; onAdd: () => void; onEdit: (blueprint: Blueprint) => void; onBrowse: (blueprintId: string | null) => void; onDelete: (blueprint: Blueprint) => void; onDeleteLibraryPlugin: (plugin: PluginLibraryItem) => void; onLaunch: (blueprintId: string) => void }) {
  const pluginCount = blueprints.reduce((sum, blueprint) => sum + blueprint.plugins.length + blueprint.files.filter((file) => file.kind === 'plugin' || file.kind === 'mu-plugin').length, 0);
  const usageCount = blueprints.reduce((sum, blueprint) => sum + blueprint.usageCount, 0);
  return <><PageHeading eyebrow="WORDPRESS STARTERS" title="Blueprints" description="Mix reusable plugins and configuration files into the exact WordPress setup each project needs." actions={<><button className="secondary-button" onClick={() => onBrowse(null)}><Download aria-hidden="true" />Browse plugins</button><button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add blueprint</button></>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={Boxes} tone="green" label="Blueprints" value={String(blueprints.length)} detail="Reusable WordPress launch recipes" /><MetricCard icon={Download} tone="blue" label="Plugin library" value={String(pluginLibrary.length)} detail="Official ZIPs ready to mix and match" /><MetricCard icon={Package} tone="violet" label="Assigned packages" value={String(pluginCount)} detail="Plugins currently used by blueprints" /><MetricCard icon={CirclePlay} tone="amber" label="Sites launched" value={String(usageCount)} detail="Managed sites tied to a blueprint" /></div>
    <section className="plugin-library-panel"><div className="plugin-library-heading"><div><span><Package aria-hidden="true" /></span><div><small>REUSABLE PLUGIN LIBRARY</small><h2>Downloaded plugins</h2><p>Keep official ZIPs here, then add any combination to a blueprint when you need it.</p></div></div><button className="secondary-button" onClick={() => onBrowse(null)}><Plus aria-hidden="true" />Add plugins</button></div>{pluginLibrary.length ? <div className="plugin-library-strip">{pluginLibrary.map((plugin) => <article key={plugin.id}><span><Package aria-hidden="true" /></span><div><strong>{plugin.name}</strong><small>{plugin.slug} · v{plugin.version}</small></div><em>{formatBytes(plugin.size)}</em><button disabled={busy === `plugin-library:${plugin.id}:delete`} onClick={() => onDeleteLibraryPlugin(plugin)} aria-label={`Remove ${plugin.name} from plugin library`} title="Remove from library"><X aria-hidden="true" /></button></article>)}</div> : <div className="plugin-library-empty"><strong>Your plugin library is empty</strong><span>Download plugins without assigning them to a blueprint, then mix them into any starter later.</span></div>}</section>
    <section className="blueprint-grid">{blueprints.map((blueprint, index) => <article className="blueprint-card" key={blueprint.id}><div className={`blueprint-cover ${index % 3 === 1 ? 'violet' : index % 3 === 2 ? 'blue' : ''}`}><span><Boxes aria-hidden="true" /></span><small>WORDPRESS BLUEPRINT</small></div><div className="blueprint-body"><div className="blueprint-title"><h2>{blueprint.name}</h2><div className="blueprint-title-actions"><button onClick={() => onEdit(blueprint)}>Edit</button><button className="blueprint-remove" disabled={busy === `blueprint:${blueprint.id}:delete` || blueprint.usageCount > 0} onClick={() => onDelete(blueprint)}>{blueprint.usageCount > 0 ? 'In use' : 'Remove'}</button></div></div><p>{blueprint.description || 'Reusable WordPress setup package.'}</p><div className="blueprint-meta"><span>{blueprint.plugins.length} plugin slug{blueprint.plugins.length === 1 ? '' : 's'}</span><span>{blueprint.themes.length} theme{blueprint.themes.length === 1 ? '' : 's'}</span><span>{blueprint.fileCount} file{blueprint.fileCount === 1 ? '' : 's'}</span><span>{formatBytes(blueprint.totalBytes)}</span></div><div className="blueprint-files">{blueprint.plugins.slice(0, 2).map((plugin) => <span key={`plugin:${plugin.slug}`}><Package aria-hidden="true" /><strong>{plugin.slug}</strong><small>Install from WordPress.org at launch</small></span>)}{blueprint.themes.slice(0, 1).map((theme) => <span key={`theme:${theme.slug}`}><Boxes aria-hidden="true" /><strong>{theme.slug}</strong><small>WordPress.org theme</small></span>)}{blueprint.files.slice(0, Math.max(0, 4 - Math.min(3, blueprint.plugins.length + blueprint.themes.length))).map((file) => <span key={file.id}><ArchiveRestore aria-hidden="true" /><strong>{file.source?.name || file.name}</strong><small>{file.source ? `WordPress.org ZIP · v${file.source.version}` : blueprintFileKindLabel(file.kind)}</small></span>)}{blueprintItemCount(blueprint) > 4 && <em>+{blueprintItemCount(blueprint) - 4} more item{blueprintItemCount(blueprint) - 4 === 1 ? '' : 's'}</em>}</div><div className="blueprint-actions"><button className="secondary-button" onClick={() => onBrowse(blueprint.id)}><Download aria-hidden="true" />Add plugins</button><button className="secondary-button" onClick={() => onLaunch(blueprint.id)}><CirclePlay aria-hidden="true" />Launch with blueprint</button></div></div></article>)}{!blueprints.length && <div className="blueprint-empty"><Empty title="No WordPress blueprints yet" copy="Download reusable plugins first or create a blueprint with packages and configuration files now." /><button className="primary-button" onClick={onAdd}><Plus aria-hidden="true" />Add your first blueprint</button></div>}</section></>;
}

function SiteWorkspace({ site, clients, backupHistoryRevision, busy, onBack, onOperate, onRestoreBackup, onSaveMetadata, onSaveBackupSchedule, onLogin }: { site: Site; clients: Client[]; backupHistoryRevision: string; busy: string | null; onBack: () => void; onOperate: (site: Site, type: string, options?: Record<string, unknown>) => Promise<boolean>; onRestoreBackup: (sourceSiteId: string, backupId: string, targetSiteId: string, restoreScope: 'all' | 'files' | 'database') => Promise<boolean>; onSaveMetadata: (site: Site, clientId: string | null, tags: string[]) => Promise<boolean>; onSaveBackupSchedule: (site: Site, mode: BackupMode, intervalHours: number) => Promise<boolean>; onLogin: (site: Site) => Promise<void> }) {
  const [tab, setTab] = useState<SiteTab>('Overview');
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [backupHistory, setBackupHistory] = useState<BackupHistory | null>(null);
  const [backupHistoryError, setBackupHistoryError] = useState<string | null>(null);
  const [clientId, setClientId] = useState(site.clientId || '');
  const [tags, setTags] = useState(site.tags.join(', '));
  const isBusy = busy === 'backup-restore' || Boolean(busy?.startsWith(site.id));
  const canOperate = !isBusy && site.status !== 'Provisioning';
  const clientName = clients.find((client) => client.id === site.clientId)?.name || 'Unassigned';
  const tabs: Array<{ id: SiteTab; label: string; icon: LucideIcon }> = [
    { id: 'Overview', label: 'Overview', icon: House },
    { id: 'Updates', label: site.kind === 'lovable' ? 'Deployments' : 'Updates', icon: Package },
    { id: 'Backups', label: 'Backups', icon: ArchiveRestore },
    { id: 'Tools', label: 'Tools', icon: ServerCog },
  ];

  const loadInventory = useCallback(async () => {
    if (site.kind === 'lovable' || site.status !== 'Running') { setInventory(null); setInventoryError(null); return; }
    setInventoryLoading(true);
    try {
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}/inventory`, { cache: 'no-store' });
      const result = await response.json() as { inventory?: Inventory; error?: string };
      if (!response.ok || !result.inventory) throw new Error(result.error || 'Inventory could not be loaded.');
      setInventory(result.inventory); setInventoryError(null);
    } catch (failure) { setInventoryError(messageFrom(failure, 'Inventory could not be loaded.')); }
    finally { setInventoryLoading(false); }
  }, [site.id, site.kind, site.status]);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void loadInventory()); return () => window.cancelAnimationFrame(frame); }, [loadInventory]);

  const loadBackupHistory = useCallback(async () => {
    if (site.kind === 'lovable') { setBackupHistory(null); setBackupHistoryError(null); return; }
    try {
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}/backups`, { cache: 'no-store' });
      const result = await response.json() as { backupHistory?: BackupHistory; error?: string };
      if (!response.ok || !result.backupHistory) throw new Error(result.error || 'Backup history could not be loaded.');
      setBackupHistory(result.backupHistory); setBackupHistoryError(null);
    } catch (failure) { setBackupHistoryError(messageFrom(failure, 'Backup history could not be loaded.')); }
  }, [site.id, site.kind]);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void loadBackupHistory()); return () => window.cancelAnimationFrame(frame); }, [backupHistoryRevision, loadBackupHistory]);

  async function run(type: string, options: Record<string, unknown> = {}) { if (await onOperate(site, type, options)) await Promise.all([loadInventory(), loadBackupHistory()]); }
  async function restoreFromHistory(sourceSiteId: string, backupId: string, targetSiteId: string, restoreScope: 'all' | 'files' | 'database') {
    const restored = await onRestoreBackup(sourceSiteId, backupId, targetSiteId, restoreScope);
    if (restored) await Promise.all([loadInventory(), loadBackupHistory()]);
    return restored;
  }
  async function saveAssignment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSaveMetadata(site, clientId || null, tags.split(',').map((tag) => tag.trim()).filter(Boolean)); }

  return <div className="site-workspace"><div className="site-hero"><div className="site-hero-toolbar"><button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" />{site.environment === 'staging' ? 'Staging' : 'All sites'}</button><span>{site.kind === 'lovable' ? 'Lovable application' : site.environment === 'staging' ? 'Isolated WordPress staging environment' : 'Managed WordPress site'}</span></div><div className="site-profile-band"><SiteThumbnail key={`${site.id}:${site.status}:${site.screenshot?.capturedAt || ''}`} site={site} /><div className="site-profile-content"><div className="site-profile-top"><div className="site-profile-heading"><h1>{site.name}</h1><a href={site.siteUrl} target="_blank" rel="noreferrer"><Globe2 aria-hidden="true" />{site.domain}<ExternalLink aria-hidden="true" /></a></div><div className="site-actions">{site.kind === 'wordpress' ? <button className="primary-button site-login-button" disabled={!canOperate || site.status !== 'Running'} onClick={() => void onLogin(site)}><LogIn aria-hidden="true" />One-click WP Admin</button> : site.lovableBuildUrl && <a className="primary-button link-button site-login-button" href={site.lovableBuildUrl} target="_blank" rel="noreferrer"><Sparkles aria-hidden="true" />Open in Lovable</a>}<details className="site-action-menu"><summary><ServerCog aria-hidden="true" />Actions<ChevronDown aria-hidden="true" /></summary><div>{site.status === 'Stopped' ? <button disabled={!canOperate} onClick={() => void run('start')}><Play aria-hidden="true" />Start site</button> : <button disabled={!canOperate} onClick={() => void run('stop')}><Square aria-hidden="true" />Stop site</button>}<button disabled={!canOperate} onClick={() => void run('restart')}><RotateCw aria-hidden="true" />Restart site</button><button disabled={!canOperate} onClick={() => void run('refresh')}><RefreshCw aria-hidden="true" />Refresh site state</button><a href={site.directUrl || site.siteUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open frontend</a></div></details></div></div><div className="site-profile-bottom"><div className="site-profile-labels"><Status site={site} />{site.environment === 'staging' && <span className="profile-badge staging"><FlaskConical aria-hidden="true" />Staging</span>}<span className="profile-badge">{site.pod}</span>{site.blueprintName && <span className="profile-badge blueprint">{site.blueprintName}</span>}<span className="client-badge"><Users aria-hidden="true" />{clientName}</span>{site.tags.map((tag) => <span className="tag-badge" key={tag}>{tag}</span>)}</div><div className="runtime-badges">{site.kind === 'wordpress' ? <><span><strong>WP</strong>{site.wp}</span><span><strong>PHP</strong>{site.php}</span></> : <><span><strong>{site.sourceProvider === 'lovable' ? 'Source' : 'Git'}</strong>{site.sourceProvider === 'lovable' ? 'Lovable' : site.repositoryBranch || 'Auto'}</span><span><strong>Rev</strong>{shortRevision(site.sourceRevision)}</span></>}</div></div></div></div><nav className="site-tabs" aria-label="Site management">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon aria-hidden="true" />{label}{id === 'Updates' && site.updates > 0 && <em>{site.updates}</em>}</button>)}</nav></div>
    <div className="site-tab-content">{site.error && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Last operation failed</strong><p>{site.error}</p></div></div>}{site.phase && <div className="provisioning-banner"><span className="spinner" /><div><strong>{site.phase}</strong><p>GeekHeros is applying the requested Docker state. This page refreshes automatically.</p></div></div>}{site.kind === 'wordpress' && inventoryError && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Live WordPress inventory unavailable</strong><p>{inventoryError}</p></div></div>}{tab === 'Backups' && backupHistoryError && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Backup history unavailable</strong><p>{backupHistoryError}</p></div></div>}
      {tab === 'Overview' && <SiteOverview site={site} clients={clients} clientId={clientId} tags={tags} busy={isBusy} onClientId={setClientId} onTags={setTags} onSave={saveAssignment} />}
      {tab === 'Updates' && (site.kind === 'lovable' ? <LovableDeploymentsPanel site={site} disabled={!canOperate} onRun={run} /> : <UpdatesPanel site={site} inventory={inventory} loading={inventoryLoading} disabled={!canOperate} onRun={run} onRefresh={loadInventory} />)}
      {tab === 'Backups' && <BackupsPanel key={`${site.id}:${site.backupPolicy?.updatedAt || 'manual'}`} site={site} backups={backupHistory?.backups || (inventory?.backups || site.backups || []).map((backup) => ({ ...backup, sourceSiteId: site.id, sourceSiteName: site.name, sourceEnvironment: site.environment }))} destinations={backupHistory?.destinations || [{ id: site.id, name: site.name, domain: site.domain, environment: site.environment, status: site.status, phase: site.phase }]} disabled={!canOperate} onBackup={() => void run('backup')} onSaveSchedule={(mode, intervalHours) => onSaveBackupSchedule(site, mode, intervalHours)} onRestore={restoreFromHistory} />}
      {tab === 'Tools' && <ToolsPanel site={site} disabled={!canOperate} onRun={run} onLogin={() => void onLogin(site)} />}
    </div></div>;
}

function SiteOverview({ site, clients, clientId, tags, busy, onClientId, onTags, onSave }: { site: Site; clients: Client[]; clientId: string; tags: string; busy: boolean; onClientId: (value: string) => void; onTags: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const isLovable = site.kind === 'lovable';
  return <><div className="metric-grid"><MetricCard icon={Container} tone="green" label={isLovable ? 'Application container' : 'WordPress container'} value={site.status} detail={site.containerName} /><MetricCard icon={Gauge} tone="violet" label="Monitored uptime" value={site.monitoring.uptimePercent === null ? 'Collecting' : `${site.monitoring.uptimePercent}%`} detail={site.monitoring.lastCheck ? `${site.monitoring.averageLatencyMs || '—'} ms average · checked ${relativeTime(site.monitoring.lastCheck.checkedAt)}` : 'Checks run every 10 minutes'} /><MetricCard icon={isLovable ? GitCommit : Package} tone="amber" label={isLovable ? 'Source changes' : 'Available updates'} value={String(site.updates)} detail={isLovable ? (site.updates ? 'Remote commits are ready to deploy' : 'Deployed revision is current') : `${site.updateCounts.plugins || 0} plugins · ${site.updateCounts.themes || 0} themes`} /><MetricCard icon={ArchiveRestore} tone="blue" label="Recovery points" value={String(site.backupCount)} detail={site.lastBackupAt ? `Last backup ${relativeTime(site.lastBackupAt)}` : 'No backups created'} /></div>
    <div className="dashboard-grid site-overview-details"><section className="content-card span-two ownership-card"><div className="card-title"><div><small>OWNERSHIP</small><h2>Client and tags</h2></div></div><form className="assignment-form" onSubmit={onSave}><label>Assigned client<select value={clientId} onChange={(event) => onClientId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}{client.company ? ` — ${client.company}` : ''}</option>)}</select></label><label>Tags<input value={tags} onChange={(event) => onTags(event.target.value)} placeholder="production, managed, ecommerce" /><small>Separate tags with commas.</small></label><button className="primary-button" disabled={busy}>Save assignment</button></form></section><section className="content-card domain-card"><div className="card-title"><div><small>EDGE ROUTING</small><h2>Domain</h2></div></div><div className="domain-detail"><span><Globe2 aria-hidden="true" /></span><strong>{site.domain}</strong><p>Traefik routes this hostname to the {isLovable ? 'Lovable application' : 'WordPress'} container over port 80.</p><a href={site.siteUrl} target="_blank" rel="noreferrer">Open domain<ExternalLink aria-hidden="true" /></a>{site.directUrl && <a href={site.directUrl} target="_blank" rel="noreferrer">Local preview<ExternalLink aria-hidden="true" /></a>}</div></section></div></>;
}

function SiteThumbnail({ site }: { site: Site }) {
  const [revision, setRevision] = useState(site.screenshot?.capturedAt || 'initial');
  const [loading, setLoading] = useState(site.status === 'Running');
  const [error, setError] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState(site.screenshot?.capturedAt || null);
  const screenshotPath = `/api/sites/${encodeURIComponent(site.id)}/screenshot?v=${encodeURIComponent(revision)}`;
  const [screenshotSrc, setScreenshotSrc] = useState(screenshotPath);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setScreenshotSrc(controlPlaneUrl(screenshotPath)));
    return () => window.cancelAnimationFrame(frame);
  }, [screenshotPath]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLoading(true);
      setRevision(String(Date.now()));
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [site.id]);

  async function refreshScreenshot() {
    setLoading(true); setError(null);
    try {
      const response = await apiFetch(`/api/sites/${encodeURIComponent(site.id)}/screenshot`, { method: 'POST' });
      const result = await response.json() as { screenshot?: { capturedAt: string }; error?: string };
      if (!response.ok || !result.screenshot) throw new Error(result.error || 'The site preview could not be refreshed.');
      setCapturedAt(result.screenshot.capturedAt);
      setRevision(result.screenshot.capturedAt);
    } catch (failure) {
      setLoading(false);
      setError(messageFrom(failure, 'The site preview could not be refreshed.'));
    }
  }

  return <div className="site-thumbnail">{site.status === 'Running' ? <div className="site-thumbnail-frame">{loading && <div className="site-thumbnail-loading"><span className="spinner" /><strong>Capturing…</strong></div>}<img key={screenshotSrc} src={screenshotSrc} crossOrigin="anonymous" alt={`Current frontend of ${site.name}`} onLoad={() => { setLoading(false); setError(null); }} onError={() => { setLoading(false); setError('Frontend preview unavailable'); }} /><button className="site-thumbnail-refresh" aria-label="Refresh site screenshot" title="Refresh site screenshot" disabled={loading} onClick={() => void refreshScreenshot()}><RefreshCw aria-hidden="true" /></button><span className="site-thumbnail-time">{capturedAt ? `Updated ${relativeTime(capturedAt)}` : 'Hourly preview'}</span>{error && <div className="site-thumbnail-error"><CircleAlert aria-hidden="true" />{error}</div>}</div> : <div className="site-thumbnail-offline"><Camera aria-hidden="true" /><strong>Site stopped</strong><small>Start it to capture the frontend.</small></div>}</div>;
}

function LovableDeploymentsPanel({ site, disabled, onRun }: { site: Site; disabled: boolean; onRun: (type: string) => Promise<void> }) {
  const direct = site.sourceProvider === 'lovable';
  return <div className="updates-layout"><section className="content-card core-update-card"><div><p className="eyebrow">LOVABLE SOURCE</p><h2>{site.updates ? 'A new revision is ready' : 'Deployment is current'}</h2><p>{direct ? 'GeekHeros reads the project directly from your connected Lovable workspace, builds it in an isolated Node environment and runs it in a production container.' : 'GeekHeros builds the synced repository in an isolated Node environment and runs the resulting application in a production container.'}</p></div><div className="package-actions"><button className="secondary-button" disabled={disabled} onClick={() => void onRun('refresh')}><RefreshCw aria-hidden="true" />Check source</button><button className="primary-button" disabled={disabled} onClick={() => void onRun('redeploy')}><Upload aria-hidden="true" />Back up & deploy</button></div></section><section className="content-card lovable-source-card"><div className="card-title"><div><small>{direct ? 'LOVABLE WORKSPACE' : 'GIT SYNC'}</small><h2>Deployment source</h2></div>{site.repositoryUrl && !direct && <a href={site.repositoryUrl} target="_blank" rel="noreferrer">Open repository<ExternalLink aria-hidden="true" /></a>}</div><div className="definition-grid"><span><small>Source</small><strong>{direct ? 'Connected Lovable project' : site.repositoryUrl || '—'}</strong></span><span><small>{direct ? 'Project' : 'Branch'}</small><strong>{direct ? site.lovableProjectId || 'Creating…' : site.repositoryBranch || 'Auto-detect'}</strong></span><span><small>Deployed revision</small><strong>{shortRevision(site.sourceRevision)}</strong></span><span><small>Last checked</small><strong>{site.lastScannedAt ? relativeTime(site.lastScannedAt) : 'Not checked'}</strong></span></div></section></div>;
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

function BackupsPanel({ site, backups, destinations, disabled, onBackup, onSaveSchedule, onRestore }: { site: Site; backups: BackupHistoryEntry[]; destinations: BackupDestination[]; disabled: boolean; onBackup: () => void; onSaveSchedule: (mode: BackupMode, intervalHours: number) => Promise<boolean>; onRestore: (sourceSiteId: string, backupId: string, targetSiteId: string, scope: 'all' | 'files' | 'database') => Promise<boolean> }) {
  const isLovable = site.kind === 'lovable';
  const policy = site.backupPolicy || defaultBackupPolicy;
  const [mode, setMode] = useState<BackupMode>(policy.mode);
  const [intervalHours, setIntervalHours] = useState(policy.intervalHours);
  const [restoreCandidate, setRestoreCandidate] = useState<BackupHistoryEntry | null>(null);
  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveSchedule(mode, intervalHours);
  }
  return <div className="backups-layout">{!isLovable && <section className="content-card backup-schedule-card"><div className="backup-schedule-heading"><span><Clock3 aria-hidden="true" /></span><div><small>{site.environment === 'staging' ? 'STAGING' : 'PRODUCTION'} WORDPRESS</small><h2>Backup schedule</h2><p>Choose manual recovery points or let the local agent create them automatically.</p></div><button className="primary-button backup-now-button" disabled={disabled || site.status !== 'Running'} onClick={onBackup}><ArchiveRestore aria-hidden="true" />Back up now</button></div><form className="backup-schedule-form" onSubmit={saveSchedule}><label>Backup mode<select value={mode} onChange={(event) => setMode(event.target.value as BackupMode)}><option value="manual">Manual only</option><option value="automatic">Automatic</option></select><small>{mode === 'manual' ? 'Backups run only when you trigger them.' : 'The local agent runs backups while this site is online.'}</small></label><label>Frequency<select value={intervalHours} disabled={mode === 'manual'} onChange={(event) => setIntervalHours(Number(event.target.value))}>{backupIntervalOptions.map((option) => <option value={option.hours} key={option.hours}>{option.label}</option>)}</select><small>{mode === 'automatic' ? `Next backup ${policy.nextBackupAt ? relativeTimeFuture(policy.nextBackupAt) : 'after the schedule is saved'}.` : 'Choose a frequency before enabling automatic backups.'}</small></label><button className="secondary-button" disabled={disabled}>Save schedule</button></form><div className="backup-schedule-status"><span><small>Last automatic backup</small><strong>{policy.lastAutomaticBackupAt ? relativeTime(policy.lastAutomaticBackupAt) : 'Not run yet'}</strong></span><span><small>Next automatic backup</small><strong>{policy.mode === 'automatic' && policy.nextBackupAt ? new Date(policy.nextBackupAt).toLocaleString() : 'Manual only'}</strong></span><span><small>Environment</small><strong>{site.environment === 'staging' ? 'Staging' : 'Production'}</strong></span></div>{policy.lastError && <div className="backup-schedule-error"><CircleAlert aria-hidden="true" /><span><strong>Last automatic backup failed</strong>{policy.lastError}</span></div>}</section>}
    <section className="content-card"><div className="card-title"><div><small>{isLovable ? 'LOCAL RECOVERY POINTS' : 'PRODUCTION & STAGING'}</small><h2>Backup history</h2></div><span className="backup-history-count">{backups.length} recovery point{backups.length === 1 ? '' : 's'}</span>{isLovable && <button className="primary-button" disabled={disabled || site.status !== 'Running'} onClick={onBackup}><ArchiveRestore aria-hidden="true" />Back up now</button>}</div><p className="section-copy">{isLovable ? 'Each recovery point archives the exact Lovable source checkout used by the local build.' : 'Recovery points from this production site and its linked staging environment appear together. Restore any one to either environment; GeekHeros creates a fresh safety backup of the destination first.'}</p><div className="backup-table"><div className={`backup-row backup-header ${isLovable ? '' : 'wordpress-history'}`}><span>Created</span>{!isLovable && <span>Source</span>}<span>{isLovable ? 'Source' : 'Database'}</span><span>Files</span>{!isLovable && <span>Restore</span>}</div>{backups.map((backup) => <div className={`backup-row ${isLovable ? '' : 'wordpress-history'}`} key={`${backup.sourceSiteId}:${backup.id}`}><span><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>{backupTriggerLabel(backup.trigger)} · {relativeTime(backup.createdAt)}</small></span>{!isLovable && <span className="backup-source"><strong>{backup.sourceSiteName}</strong><small className={backup.sourceEnvironment}>{backup.sourceEnvironment}</small></span>}<code>{isLovable ? backup.files[0] || '—' : backup.files.find((file) => file.endsWith('.sql')) || '—'}</code><code>{backup.files.find((file) => file.endsWith('.tar.gz')) || '—'}</code>{!isLovable && <span className="backup-restore-actions"><button disabled={disabled} onClick={() => setRestoreCandidate(backup)}><ArchiveRestore aria-hidden="true" />Restore</button></span>}</div>)}{!backups.length && <Empty title="No backups yet" copy="Create a recovery point before maintenance or major content changes." />}</div></section>
    {restoreCandidate && <RestoreBackupModal key={`${restoreCandidate.sourceSiteId}:${restoreCandidate.id}`} backup={restoreCandidate} destinations={destinations} busy={disabled} onClose={() => setRestoreCandidate(null)} onRestore={onRestore} />}
  </div>;
}

function RestoreBackupModal({ backup, destinations, busy, onClose, onRestore }: { backup: BackupHistoryEntry; destinations: BackupDestination[]; busy: boolean; onClose: () => void; onRestore: (sourceSiteId: string, backupId: string, targetSiteId: string, scope: 'all' | 'files' | 'database') => Promise<boolean> }) {
  const availableDestinations = destinations.filter((destination) => !destination.phase);
  const preferredDestination = availableDestinations.find((destination) => destination.id === backup.sourceSiteId) || availableDestinations[0] || destinations[0];
  const [targetSiteId, setTargetSiteId] = useState(preferredDestination?.id || '');
  const [scope, setScope] = useState<'all' | 'files' | 'database'>('all');
  const [restoring, setRestoring] = useState(false);
  const target = destinations.find((destination) => destination.id === targetSiteId);
  const locked = busy || restoring;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetSiteId || !target || target.phase) return;
    setRestoring(true);
    try { if (await onRestore(backup.sourceSiteId, backup.id, targetSiteId, scope)) onClose(); }
    finally { setRestoring(false); }
  }
  return <div className="modal-backdrop restore-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !locked) onClose(); }}><section className="modal restore-backup-modal" role="dialog" aria-modal="true" aria-labelledby="restore-backup-title"><div className="modal-head"><div><p className="eyebrow">POINT-IN-TIME RECOVERY</p><h2 id="restore-backup-title">Restore backup</h2><p>Choose exactly where this recovery point should be restored.</p></div><button onClick={onClose} disabled={locked} aria-label="Close"><X aria-hidden="true" /></button></div><div className="restore-backup-summary"><span><ArchiveRestore aria-hidden="true" /></span><div><small>RECOVERY POINT</small><strong>{new Date(backup.createdAt).toLocaleString()}</strong><p>Created from {backup.sourceSiteName} · {backup.sourceEnvironment}</p></div></div><form onSubmit={submit}><div className="form-grid"><label className="full-field">Restore destination<select value={targetSiteId} onChange={(event) => setTargetSiteId(event.target.value)} required autoFocus>{destinations.map((destination) => <option value={destination.id} key={destination.id} disabled={Boolean(destination.phase)}>{destination.name} — {destination.environment === 'staging' ? 'Staging' : 'Production'} — {destination.domain}{destination.phase ? ` (${destination.phase})` : ''}</option>)}</select><small>The selected environment will be replaced by this recovery point.</small></label><label className="full-field">Restore content<select value={scope} onChange={(event) => setScope(event.target.value as 'all' | 'files' | 'database')}><option value="all">Everything — WordPress files and database</option><option value="files">WordPress files only</option><option value="database">Database only</option></select><small>Everything is recommended for a complete point-in-time recovery.</small></label></div><div className={`restore-warning ${target?.environment === 'production' ? 'production' : 'staging'}`}><CircleAlert aria-hidden="true" /><p><strong>{target?.environment === 'production' ? 'You are restoring to production.' : 'You are restoring to staging.'}</strong>{target ? ` ${target.name} will be replaced with the selected ${scope === 'all' ? 'files and database' : scope}.` : ' Choose an available destination.'}</p></div><div className="restore-safety-note"><ShieldCheck aria-hidden="true" /><p><strong>A safety backup is automatic.</strong> GeekHeros captures the destination immediately before the restore, rewrites URLs when moving between environments, and keeps search indexing blocked in staging.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={locked}>Cancel</button><button className="primary-button restore-submit" disabled={locked || !targetSiteId || !target || Boolean(target.phase)}>{restoring ? 'Restoring backup…' : `Restore to ${target?.environment === 'production' ? 'production' : 'staging'}`}</button></div></form></section></div>;
}

type DeveloperToolType = 'terminal' | 'database' | 'logs' | 'wp-cli' | 'files' | 'runtime';
const developerTools: Array<{ type: DeveloperToolType; title: string; copy: string; icon: LucideIcon; wordpressOnly?: boolean }> = [
  { type: 'terminal', title: 'Container terminal', copy: 'Audited command-line access scoped to the site container.', icon: Terminal },
  { type: 'database', title: 'Database manager', copy: 'Query or intentionally update the isolated WordPress database.', icon: Database, wordpressOnly: true },
  { type: 'logs', title: 'Log viewer', copy: 'Read timestamped web application and database container logs.', icon: Logs },
  { type: 'wp-cli', title: 'WP-CLI', copy: 'Run audited WordPress commands in the managed environment.', icon: Terminal, wordpressOnly: true },
  { type: 'files', title: 'Code editor', copy: 'Read and edit text source files safely inside wp-content.', icon: FileCode2, wordpressOnly: true },
  { type: 'runtime', title: 'Web server', copy: 'Inspect container, network, ports and runtime resource limits.', icon: ServerCog },
];

function ToolsPanel({ site, disabled, onRun, onLogin }: { site: Site; disabled: boolean; onRun: (type: string, options?: Record<string, unknown>) => Promise<void>; onLogin: () => void }) {
  const [developerTool, setDeveloperTool] = useState<DeveloperToolType | null>(null);
  const isLovable = site.kind === 'lovable';
  const directSource = isLovable && (site.sourceProvider === 'lovable' || !site.repositoryUrl);
  return <><section className="content-card"><div className="card-title"><div><small>{isLovable ? 'LOVABLE & CONTAINER' : 'WORDPRESS & CONTAINER'}</small><h2>Site tools</h2></div></div><div className="operation-grid">{isLovable ? <><Operation icon={RefreshCw} title="Check source" copy={directSource ? 'Compare the connected Lovable project with the deployed revision.' : 'Compare the deployed commit with the configured Git branch.'} disabled={disabled} onClick={() => void onRun('refresh')} /><Operation icon={Upload} title="Deploy latest" copy={directSource ? 'Back up, import the latest Lovable source, rebuild and replace the container.' : 'Back up the checkout, pull the branch, rebuild and replace the container.'} disabled={disabled} onClick={() => void onRun('redeploy')} /><Operation icon={ArchiveRestore} title="Create backup" copy="Archive the exact imported source used for this build." disabled={disabled} onClick={() => void onRun('backup')} /><Operation icon={ShieldCheck} title="Verify source" copy={directSource ? 'Confirm the connected project and local package definition are readable.' : 'Confirm the repository branch and local package definition are readable.'} disabled={disabled} onClick={() => void onRun('scan')} /><Operation icon={RotateCw} title="Restart container" copy="Restart the application container without rebuilding." disabled={disabled} onClick={() => void onRun('restart')} />{site.lovableBuildUrl && <a className="operation-card" href={site.lovableBuildUrl} target="_blank" rel="noreferrer"><span><Sparkles aria-hidden="true" /></span><strong>Continue in Lovable</strong><small>Open the connected project for further generation.</small><em>Open Lovable<ExternalLink aria-hidden="true" /></em></a>}</> : <><Operation icon={RefreshCw} title="Refresh inventory" copy="Read live core, plugin, theme and PHP versions." disabled={disabled} onClick={() => void onRun('refresh')} /><Operation icon={Upload} title="Update everything" copy="Back up, then update WordPress core, all plugins and all themes." disabled={disabled} onClick={() => void onRun('update')} /><Operation icon={ArchiveRestore} title="Create backup" copy="Export MariaDB and archive the WordPress volume." disabled={disabled} onClick={() => void onRun('backup')} /><Operation icon={ShieldCheck} title="Verify checksums" copy="Validate WordPress core and available plugin checksums." disabled={disabled} onClick={() => void onRun('scan')} /><Operation icon={RotateCw} title="Restart containers" copy="Restart MariaDB and WordPress in dependency order." disabled={disabled} onClick={() => void onRun('restart')} /><Operation icon={LogIn} title="One-click WP Admin" copy="Issue a one-time, 60-second administrator session." disabled={disabled} onClick={onLogin} /></>}</div></section><section className="content-card developer-tools-card"><div className="card-title"><div><small>DEVELOPER ACCESS</small><h2>Developer tools</h2><p>Real, audited container tools modeled on the GetDollie site-management baseline.</p></div></div><div className="tool-grid">{developerTools.map(({ type, title, copy, icon: Icon, wordpressOnly }) => <button className="tool-card" key={type} disabled={disabled || (wordpressOnly && isLovable)} onClick={() => setDeveloperTool(type)}><span><Icon aria-hidden="true" /></span><strong>{title}</strong><small>{wordpressOnly && isLovable ? 'Available for managed WordPress sites.' : copy}</small><em>Open tool<ArrowRight aria-hidden="true" /></em></button>)}</div></section><section className="content-card tool-details"><div className="card-title"><div><small>RUNTIME DETAILS</small><h2>Container endpoints</h2></div></div><div className="definition-grid"><span><small>{isLovable ? 'Application' : 'WordPress'}</small><strong>{site.containerName}</strong></span><span><small>{isLovable ? directSource ? 'Source' : 'Source branch' : 'MariaDB'}</small><strong>{isLovable ? directSource ? 'Connected Lovable project' : site.repositoryBranch || 'Auto-detect' : site.databaseContainer}</strong></span><span><small>Image</small><strong>{site.image}</strong></span><span><small>Container ID</small><strong>{site.containerId || '—'}</strong></span><span><small>Domain</small><strong>{site.siteUrl}</strong></span><span><small>Local preview</small><strong>{site.directUrl || '—'}</strong></span></div></section><section className="danger-zone"><div><strong>Remove site</strong><p>{isLovable ? 'Deletes the application container, built image, local source checkout and backups.' : 'Deletes both containers, their named volumes and local backups.'}</p></div><button disabled={disabled} onClick={() => void onRun('delete', { deleteData: true })}>Delete site and data</button></section>{developerTool && <DeveloperToolModal site={site} tool={developerTool} onClose={() => setDeveloperTool(null)} />}</>;
}

function parseCommandLine(value: string) {
  return (value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map((part) => {
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) return part.slice(1, -1);
    return part;
  });
}

function DeveloperToolModal({ site, tool, onClose }: { site: Site; tool: DeveloperToolType; onClose: () => void }) {
  const config = developerTools.find((entry) => entry.type === tool) || developerTools[0];
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState(tool === 'wp-cli' ? 'plugin list --format=table' : 'ls -la');
  const [query, setQuery] = useState('SELECT option_name, option_value FROM wp_options LIMIT 20;');
  const [allowWrites, setAllowWrites] = useState(false);
  const [filePath, setFilePath] = useState('wp-content/themes/');
  const [fileContent, setFileContent] = useState('');
  const [fileOptions, setFileOptions] = useState<string[]>([]);

  const showResult = useCallback((result: unknown) => setOutput(typeof result === 'string' ? result : JSON.stringify(result, null, 2)), []);
  const requestTool = useCallback(async (path: string, init?: RequestInit) => {
    setBusy(true); setError(null);
    try {
      const response = await apiFetch(path, init);
      const payload = await response.json() as { result?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error || 'The developer tool failed.');
      showResult(payload.result ?? payload);
      return payload.result as Record<string, unknown> | undefined;
    } catch (failure) {
      setError(messageFrom(failure, 'The developer tool failed.'));
      return undefined;
    } finally { setBusy(false); }
  }, [showResult]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (tool === 'logs' || tool === 'runtime') void requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer?tool=${tool}`);
      if (tool === 'files') void requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer?tool=files`).then((result) => {
        const files = Array.isArray(result?.files) ? result.files.map(String) : [];
        setFileOptions(files);
        if (files[0]) setFilePath(files[0]);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestTool, site.id, tool]);

  async function runCommand() {
    let args = parseCommandLine(command);
    if (tool === 'wp-cli' && args[0] === 'wp') args = args.slice(1);
    await requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, args }) });
  }
  async function runDatabaseQuery() {
    await requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: 'database', query, allowWrites }) });
  }
  async function loadFile() {
    const result = await requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer?tool=file&path=${encodeURIComponent(filePath)}`);
    if (result && typeof result.content === 'string') setFileContent(result.content);
  }
  async function saveFile() {
    await requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: 'write-file', path: filePath, content: fileContent }) });
  }

  return <div className="modal-backdrop developer-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal developer-modal" role="dialog" aria-modal="true" aria-labelledby="developer-tool-title"><div className="modal-head"><div><p className="eyebrow">AUDITED SITE ACCESS</p><h2 id="developer-tool-title">{config.title}</h2><p>{config.copy}</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><div className="developer-tool-body">
    {(tool === 'terminal' || tool === 'wp-cli') && <div className="developer-command"><label>{tool === 'wp-cli' ? 'WP-CLI arguments' : 'Container command'}<input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={tool === 'wp-cli' ? 'plugin list --format=table' : 'ls -la'} /></label><button className="primary-button" disabled={busy || !command.trim()} onClick={() => void runCommand()}>{busy ? 'Running…' : 'Run command'}</button><small>Commands are split into arguments and never passed through a host shell.</small></div>}
    {tool === 'database' && <div className="developer-command"><label>SQL query<textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={7} /></label><label className="developer-write-toggle"><input type="checkbox" checked={allowWrites} onChange={(event) => setAllowWrites(event.target.checked)} />Allow database-changing statements</label><button className="primary-button" disabled={busy || !query.trim()} onClick={() => void runDatabaseQuery()}>{busy ? 'Running…' : 'Run query'}</button></div>}
    {tool === 'files' && <div className="developer-file-editor"><div><label>File inside wp-content<input list="site-file-options" value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="wp-content/themes/my-theme/style.css" /><datalist id="site-file-options">{fileOptions.map((file) => <option value={file} key={file} />)}</datalist></label><button className="secondary-button" disabled={busy || !filePath.trim()} onClick={() => void loadFile()}>Load</button><button className="primary-button" disabled={busy || !filePath.trim()} onClick={() => void saveFile()}>Save</button></div><textarea value={fileContent} onChange={(event) => setFileContent(event.target.value)} rows={16} spellCheck={false} aria-label="File contents" /></div>}
    {(tool === 'logs' || tool === 'runtime') && <button className="secondary-button developer-refresh" disabled={busy} onClick={() => void requestTool(`/api/sites/${encodeURIComponent(site.id)}/developer?tool=${tool}`)}><RefreshCw aria-hidden="true" />Refresh</button>}
    {error && <p className="developer-tool-error" role="alert">{error}</p>}
    {output && <pre className="developer-output"><code>{output}</code></pre>}
  </div></section></div>;
}

function Operation({ icon: Icon, title, copy, disabled, onClick }: { icon: LucideIcon; title: string; copy: string; disabled: boolean; onClick: () => void }) { return <button className="operation-card" disabled={disabled} onClick={onClick}><span><Icon aria-hidden="true" /></span><strong>{title}</strong><small>{copy}</small><em>Run operation<ArrowRight aria-hidden="true" /></em></button>; }
function AgentsView({ agents, allAgents, busy, onManage, onRefresh }: { agents: McpAgent[]; allAgents: McpAgent[]; busy: string | null; onManage: (agent: McpAgent, action: 'restart' | 'remove' | 'restore' | 'forget') => Promise<void>; onRefresh: () => void }) {
  const connected = allAgents.filter((agent) => agent.status === 'Connected').length;
  const removed = allAgents.filter((agent) => agent.status === 'Removed').length;
  const requests = allAgents.reduce((sum, agent) => sum + agent.requestCount, 0);
  return <><PageHeading eyebrow="MCP CONNECTIONS" title="Agents" description="See every MCP client observed by this control plane and manage its server-side access." actions={<button className="secondary-button" onClick={onRefresh}><RefreshCw aria-hidden="true" />Refresh telemetry</button>} />
    <div className="metric-grid compact-metrics"><MetricCard icon={Radio} tone="green" label="Connected" value={String(connected)} detail="Seen in the last two minutes" /><MetricCard icon={Clock3} tone="blue" label="Known agents" value={String(allAgents.length)} detail="Unique client and IP fingerprints" /><MetricCard icon={Activity} tone="violet" label="MCP requests" value={String(requests)} detail="Authenticated requests observed" /><MetricCard icon={ShieldOff} tone="amber" label="Removed" value={String(removed)} detail="Client fingerprints currently denied" /></div>
    <div className="agent-telemetry-note"><Radio aria-hidden="true" /><p><strong>Connection status is request-based.</strong> MCP uses HTTP, so “Connected” means the client contacted this server within two minutes. GeekHeros stores identity and performance telemetry only—never authorization headers, tool arguments or prompt contents.</p></div>
    <section className="fleet-panel agent-panel"><div className="agent-row agent-header"><span>Agent</span><span>Status</span><span>Network</span><span>Usage</span><span>Last activity</span><span>Management</span></div>{agents.map((agent) => {
      const actionBusy = Boolean(busy?.startsWith(`agent:${agent.id}:`));
      return <article className="agent-row" key={agent.id}><div className="agent-identity"><span className="agent-avatar"><Bot aria-hidden="true" /></span><span><strong>{agent.name}</strong><small>{agent.clientVersion ? `Version ${agent.clientVersion}` : agent.clientName || 'Unidentified MCP client'}</small></span></div><span className={`agent-status ${agent.status.toLowerCase()}`}><i />{agent.status}</span><span className="agent-network"><strong>{agent.ip}</strong><small>{agent.local ? 'Local loopback' : agent.platform}{agent.remotePort ? ` · port ${agent.remotePort}` : ''}</small></span><span className="agent-usage"><strong>{agent.toolCallCount} tool call{agent.toolCallCount === 1 ? '' : 's'}</strong><small>{agent.requestCount} request{agent.requestCount === 1 ? '' : 's'} · {agent.errorCount} error{agent.errorCount === 1 ? '' : 's'}</small></span><span className="agent-last-seen"><strong>{agent.lastTool || agent.lastMethod || 'Handshake only'}</strong><small>{agent.lastSeenAt ? relativeTime(agent.lastSeenAt) : agent.restartRequestedAt ? 'Waiting to reconnect' : agent.revokedAt ? `Removed ${relativeTime(agent.revokedAt)}` : 'Not currently connected'}</small></span><span className="agent-actions">{agent.status === 'Removed' ? <><button disabled={actionBusy} onClick={() => void onManage(agent, 'restore')}><Undo2 aria-hidden="true" />Restore</button><button className="quiet-danger" disabled={actionBusy} onClick={() => void onManage(agent, 'forget')}><Trash2 aria-hidden="true" />Forget</button></> : <><button disabled={actionBusy || agent.status === 'Restarting'} onClick={() => void onManage(agent, 'restart')}><RotateCcw aria-hidden="true" />Restart</button><button className="quiet-danger" disabled={actionBusy} onClick={() => void onManage(agent, 'remove')}><ShieldOff aria-hidden="true" />Remove</button></>}</span><details className="agent-telemetry"><summary>View telemetry</summary><div><span><small>Client</small><strong>{agent.clientTitle || agent.clientName || agent.name}</strong></span><span><small>Transport</small><strong>{agent.transport}</strong></span><span><small>MCP protocol</small><strong>{agent.protocolVersion || 'Not reported'}</strong></span><span><small>Platform</small><strong>{agent.platform}</strong></span><span><small>Average latency</small><strong>{agent.averageLatencyMs == null ? '—' : `${agent.averageLatencyMs} ms`}</strong></span><span><small>Last response</small><strong>{agent.lastResponseStatus || '—'}</strong></span><span><small>First observed</small><strong>{new Date(agent.firstSeenAt).toLocaleString()}</strong></span><span><small>Restarts</small><strong>{agent.restartCount}</strong></span><span className="agent-user-agent"><small>User agent</small><code>{agent.userAgent}</code></span><span className="agent-capabilities"><small>Client capabilities</small><strong>{agent.capabilities.length ? agent.capabilities.join(' · ') : 'None reported'}</strong></span></div></details></article>;
    })}{!agents.length && <Empty title="No MCP agents observed" copy="Agents appear here after they authenticate and make their first MCP request." />}</section></>;
}

const analyticsStatusColors: Record<string, string> = {
  Running: '#35b878', Stopped: '#93a099', Provisioning: '#e0a34a', Error: '#d96b5c', Attention: '#d96b5c', Unknown: '#77847d',
};

function AnalyticsView({ sites, onOpen }: { sites: Site[]; onOpen: (id: string) => void }) {
  const [rangeDays, setRangeDays] = useState<AnalyticsRangeDays>(7);
  const [siteId, setSiteId] = useState('');
  const [environment, setEnvironment] = useState<AnalyticsEnvironment>('all');
  const [kind, setKind] = useState<AnalyticsKind>('all');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const query = new URLSearchParams({ rangeDays: String(rangeDays), environment, kind });
      if (siteId) query.set('siteId', siteId);
      const response = await apiFetch(`/api/analytics?${query.toString()}`, { cache: 'no-store' });
      const result = await response.json() as { analytics?: AnalyticsData; error?: string };
      if (!response.ok || !result.analytics) throw new Error(result.error || 'Analytics could not be loaded.');
      setAnalytics(result.analytics); setAnalyticsError(null);
    } catch (failure) { setAnalytics(null); setAnalyticsError(messageFrom(failure, 'Analytics could not be loaded.')); }
    finally { setAnalyticsLoading(false); }
  }, [environment, kind, rangeDays, siteId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadAnalytics());
    return () => window.cancelAnimationFrame(frame);
  }, [loadAnalytics, revision]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadAnalytics(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadAnalytics]);

  const rangeLabel = analyticsRangeLabel(rangeDays);
  const chartHasChecks = Boolean(analytics?.summary.checkCount);
  const chartHasOperations = Boolean(analytics?.series.some((point) => point.operations || point.backups));
  const sortedSites = useMemo(() => [...sites].sort((a, b) => a.name.localeCompare(b.name)), [sites]);
  const recentChecks = analytics?.recentChecks.slice(0, 40) || [];

  function chooseSite(value: string) {
    setSiteId(value);
    if (value) { setEnvironment('all'); setKind('all'); }
  }
  function chooseEnvironment(value: AnalyticsEnvironment) { setEnvironment(value); setSiteId(''); }
  function chooseKind(value: AnalyticsKind) { setKind(value); setSiteId(''); }

  return <><PageHeading eyebrow="FLEET INTELLIGENCE" title="Analytics" description="Observed availability, response time, operations and recovery data from this local control plane." actions={<button className="secondary-button" disabled={analyticsLoading} onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" />{analyticsLoading ? 'Refreshing…' : 'Refresh data'}</button>} />
    <section className="analytics-filter-bar" aria-label="Analytics filters"><label>Time range<select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value) as AnalyticsRangeDays)}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><label>Site<select value={siteId} onChange={(event) => chooseSite(event.target.value)}><option value="">All sites</option>{sortedSites.map((site) => <option value={site.id} key={site.id}>{site.name} — {site.environment === 'staging' ? 'Staging' : 'Production'}</option>)}</select></label><label>Environment<select value={environment} onChange={(event) => chooseEnvironment(event.target.value as AnalyticsEnvironment)}><option value="all">All environments</option><option value="production">Production only</option><option value="staging">Staging only</option></select></label><label>Workload<select value={kind} onChange={(event) => chooseKind(event.target.value as AnalyticsKind)}><option value="all">All workloads</option><option value="wordpress">WordPress</option><option value="lovable">Lovable</option></select></label><span className="analytics-freshness"><i className={analyticsLoading ? 'loading' : ''} />{analytics ? `Live records · Updated ${relativeTime(analytics.generatedAt)}` : 'Waiting for telemetry'}</span></section>
    {analyticsError && <div className="site-error"><span><CircleAlert aria-hidden="true" /></span><div><strong>Analytics unavailable</strong><p>{analyticsError}</p></div></div>}
    {!analytics && analyticsLoading ? <section className="content-card"><Empty title="Calculating analytics…" copy="GeekHeros is aggregating real monitoring, backup and operation records." /></section> : analytics && <>
      <div className="analytics-provenance"><Database aria-hidden="true" /><p><strong>Observed data only.</strong> {analytics.provenance.monitoringChecks} monitoring checks · {analytics.provenance.activityEntries} operations · {analytics.provenance.backups} backups · {analytics.provenance.currentContainerInspections} live container inspections. No sample or simulated records are used; blanks mean data has not been collected.</p></div>
      <div className="metric-grid analytics-metrics"><MetricCard icon={Gauge} tone="green" label="Availability" value={formatAnalyticsPercent(analytics.summary.availabilityPercent)} detail={`${analytics.summary.failedChecks} failed of ${analytics.summary.checkCount} checks`} meta={rangeLabel} /><MetricCard icon={Activity} tone="blue" label="Average response" value={analytics.summary.averageLatencyMs === null ? '—' : `${analytics.summary.averageLatencyMs} ms`} detail={`P95 ${analytics.summary.p95LatencyMs === null ? '—' : `${analytics.summary.p95LatencyMs} ms`}`} meta={rangeLabel} /><MetricCard icon={ShieldCheck} tone="violet" label="Operations completed" value={String(analytics.summary.operationCount - analytics.summary.failedOperations)} detail={`${analytics.summary.failedOperations} failed · ${formatAnalyticsPercent(analytics.summary.operationSuccessPercent)} success`} meta={rangeLabel} /><MetricCard icon={ArchiveRestore} tone="amber" label="Recovery points" value={String(analytics.summary.backupCount)} detail={`${analytics.summary.siteCount} site${analytics.summary.siteCount === 1 ? '' : 's'} · ${analytics.summary.availableUpdates} updates open`} meta={rangeLabel} /></div>
      <div className="analytics-chart-grid"><section className="content-card analytics-chart-card analytics-chart-wide"><div className="analytics-card-heading"><div><small>UPTIME & LATENCY</small><h2>Service performance</h2><p>{analytics.summary.checkCount} real HTTP checks across the selected scope.</p></div><div className="analytics-legend"><span><i className="availability" />Availability</span><span><i className="latency" />Response time</span></div></div>{chartHasChecks ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.series} margin={{ top: 12, right: 8, left: -8, bottom: 2 }}><defs><linearGradient id="analyticsAvailability" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#43b979" stopOpacity={0.3} /><stop offset="100%" stopColor="#43b979" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#e8eeea" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="bucketStart" tickFormatter={(value) => analyticsAxisLabel(String(value), rangeDays)} tick={{ fill: '#748078', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} /><YAxis yAxisId="uptime" domain={[0, 100]} tick={{ fill: '#748078', fontSize: 11 }} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} /><YAxis yAxisId="latency" orientation="right" tick={{ fill: '#748078', fontSize: 11 }} tickFormatter={(value) => `${value}ms`} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} contentStyle={{ border: '1px solid #dfe7e2', borderRadius: 9, boxShadow: '0 10px 30px rgba(22,42,31,.12)', fontSize: 12 }} /><Area yAxisId="uptime" type="monotone" dataKey="uptimePercent" name="Availability (%)" stroke="#2ea86a" strokeWidth={2} fill="url(#analyticsAvailability)" connectNulls isAnimationActive={false} /><Line yAxisId="latency" type="monotone" dataKey="averageLatencyMs" name="Average response (ms)" stroke="#4f86c6" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <AnalyticsChartEmpty title="No monitoring samples in this range" copy="Checks appear here as the 10-minute monitor collects them." />}</section>
        <section className="content-card analytics-chart-card"><div className="analytics-card-heading"><div><small>LIVE FLEET</small><h2>Current status</h2><p>{analytics.summary.runningSites} of {analytics.summary.siteCount} sites running.</p></div></div>{analytics.statusBreakdown.length ? <><div className="analytics-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={{ border: '1px solid #dfe7e2', borderRadius: 9, fontSize: 12 }} /><Pie data={analytics.statusBreakdown} dataKey="count" nameKey="status" innerRadius={58} outerRadius={82} paddingAngle={3} strokeWidth={0} isAnimationActive={false}>{analytics.statusBreakdown.map((item) => <Cell key={item.status} fill={analyticsStatusColors[item.status] || analyticsStatusColors.Unknown} />)}</Pie></PieChart></ResponsiveContainer><strong>{analytics.summary.siteCount}<small>sites</small></strong></div><div className="analytics-status-legend">{analytics.statusBreakdown.map((item) => <span key={item.status}><i style={{ background: analyticsStatusColors[item.status] || analyticsStatusColors.Unknown }} /><strong>{item.status}</strong><em>{item.count}</em></span>)}</div></> : <AnalyticsChartEmpty title="No sites match" copy="Adjust the site or workload filters." />}</section>
        <section className="content-card analytics-chart-card analytics-chart-wide"><div className="analytics-card-heading"><div><small>CONTROL-PLANE EVENTS</small><h2>Operations and backups</h2><p>Completed actions, failures and recovery points by {analytics.range.bucket}.</p></div></div>{chartHasOperations ? <div className="analytics-chart analytics-bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.series} margin={{ top: 12, right: 6, left: -18, bottom: 2 }}><CartesianGrid stroke="#e8eeea" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="bucketStart" tickFormatter={(value) => analyticsAxisLabel(String(value), rangeDays)} tick={{ fill: '#748078', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} /><YAxis allowDecimals={false} tick={{ fill: '#748078', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} contentStyle={{ border: '1px solid #dfe7e2', borderRadius: 9, boxShadow: '0 10px 30px rgba(22,42,31,.12)', fontSize: 12 }} /><Bar dataKey="operations" name="Operations" fill="#5c8ec8" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="backups" name="Backups" fill="#8a69be" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="failedOperations" name="Failed operations" fill="#d96b5c" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div> : <AnalyticsChartEmpty title="No operations in this range" copy="Lifecycle actions and recovery points will appear as they occur." />}</section>
        <section className="content-card analytics-chart-card"><div className="analytics-card-heading"><div><small>OPERATION MIX</small><h2>Most-used tools</h2><p>Actual control-plane actions in this range.</p></div></div><div className="analytics-operation-list">{analytics.operationTypes.slice(0, 7).map((item) => <span key={item.type}><i><ChartNoAxesCombined aria-hidden="true" /></i><strong>{humanizeOperation(item.type)}</strong><small>{item.failures ? `${item.failures} failed` : 'No failures'}</small><em>{item.count}</em></span>)}{!analytics.operationTypes.length && <AnalyticsChartEmpty title="No operation data" copy="Run a site action to begin the breakdown." />}</div></section>
      </div>
      <section className="fleet-panel analytics-table-panel"><div className="analytics-table-title"><div><small>SITE BREAKDOWN</small><h2>Performance by site</h2></div><span>Sorted by lowest availability</span></div><div className="analytics-site-row analytics-table-header"><span>Site</span><span>Availability</span><span>Response</span><span>Checks</span><span>Operations</span><span>Backups</span><span>Status</span><span /></div>{analytics.siteMetrics.map((site) => <button className="analytics-site-row" key={site.id} onClick={() => onOpen(site.id)}><span className="analytics-site-name"><i>{initials(site.name)}</i><span><strong>{site.name}</strong><small>{site.domain} · {site.environment}</small></span></span><span><strong>{formatAnalyticsPercent(site.uptimePercent)}</strong><small>{site.failedChecks} failed</small></span><span><strong>{site.averageLatencyMs === null ? '—' : `${site.averageLatencyMs} ms`}</strong><small>P95 {site.p95LatencyMs === null ? '—' : `${site.p95LatencyMs} ms`}</small></span><span><strong>{site.checkCount}</strong><small>{site.lastCheckAt ? relativeTime(site.lastCheckAt) : 'No samples'}</small></span><span><strong>{site.operationCount}</strong><small>{site.failedOperations} failed</small></span><span><strong>{site.backupCount}</strong><small>{site.lastBackupAt ? relativeTime(site.lastBackupAt) : 'None yet'}</small></span><span className={`analytics-health ${site.status.toLowerCase().replace(/[^a-z]+/g, '-')}`}><i />{site.status}</span><ChevronRight aria-hidden="true" /></button>)}{!analytics.siteMetrics.length && <Empty title="No sites match these filters" copy="Choose a different site, environment or workload." />}</section>
      <section className="fleet-panel analytics-measurements"><div className="analytics-table-title"><div><small>GRANULAR DATA</small><h2>Recent measurements</h2></div><span>Latest {recentChecks.length} of {analytics.recentChecks.length} samples</span></div><div className="analytics-check-row analytics-table-header"><span>Timestamp</span><span>Site</span><span>Result</span><span>HTTP</span><span>Response</span><span>Details</span></div>{recentChecks.map((check) => <div className="analytics-check-row" key={`${check.siteId}:${check.checkedAt}`}><time>{new Date(check.checkedAt).toLocaleString()}</time><span><strong>{check.siteName}</strong><small>{check.environment} · {check.kind}</small></span><span className={`analytics-result ${check.ok ? 'success' : 'failed'}`}><i />{check.ok ? 'Available' : 'Failed'}</span><strong>{check.statusCode || '—'}</strong><strong>{check.latencyMs === null ? '—' : `${check.latencyMs} ms`}</strong><small>{check.error || 'Request completed normally'}</small></div>)}{!recentChecks.length && <Empty title="No measurements in this range" copy="Monitoring runs every 10 minutes while managed sites are online." />}</section>
    </>}
  </>;
}

function AnalyticsChartEmpty({ title, copy }: { title: string; copy: string }) { return <div className="analytics-chart-empty"><ChartNoAxesCombined aria-hidden="true" /><strong>{title}</strong><small>{copy}</small></div>; }

function ActivityView({ entries }: { entries: ActivityEntry[] }) { return <><PageHeading eyebrow="AUDIT LOG" title="Activity" description="Completed and failed operations reported by the local Docker agent." /><section className="content-card"><ActivityList entries={entries} /></section></>; }
function ActivityList({ entries }: { entries: ActivityEntry[] }) { if (!entries.length) return <Empty title="No operations recorded" copy="Container launches and lifecycle actions will appear here." />; return <div className="timeline live-timeline">{entries.map((entry) => <div key={entry.id}><span className={`activity-dot ${entry.state === 'failed' ? 'red' : 'green'}`} /><span><strong>{entry.message}</strong><small>{entry.siteName} · {entry.type}</small></span><time>{relativeTime(entry.createdAt)}</time></div>)}</div>; }

function SettingsView({ system, onToast }: { system: SystemInfo; onToast: (message: string) => void }) {
  const [lovable, setLovable] = useState<LovableConnection>({ connected: false, account: null, workspaces: [], connectedAt: null });
  const [lovableLoading, setLovableLoading] = useState(true);
  const [lovableBusy, setLovableBusy] = useState(false);
  const [lovableError, setLovableError] = useState<string | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
  const mcpJson = system.mcp ? JSON.stringify(system.mcp.config, null, 2) : '';

  const refreshLovable = useCallback(async () => {
    const response = await apiFetch('/api/lovable', { cache: 'no-store' });
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
      const response = await apiFetch('/api/lovable', { method: 'POST' });
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
      const response = await apiFetch('/api/lovable', { method: 'DELETE' });
      const result = await response.json() as LovableConnection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Lovable could not be disconnected.');
      setLovable(result); onToast('Lovable was disconnected from GeekHeros.');
    } catch (failure) { setLovableError(messageFrom(failure, 'Lovable could not be disconnected.')); }
    finally { setLovableBusy(false); }
  }

  async function copyMcpConfiguration() {
    if (!mcpJson) return;
    try {
      await navigator.clipboard.writeText(mcpJson);
      setMcpCopied(true);
      onToast('MCP connection JSON copied.');
      window.setTimeout(() => setMcpCopied(false), 1800);
    } catch {
      onToast('The MCP JSON could not be copied. Select the code and copy it manually.');
    }
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
          <div className="mcp-section-heading"><div><h2>AI agent MCP</h2><p>Connect an MCP-compatible agent to every control-plane capability on this machine.</p></div>{system.mcp && <span>{system.mcp.toolCount} tools</span>}</div>
          {mcpJson ? <div className="mcp-code-block">
            <div><span>mcp.json</span><button type="button" onClick={() => void copyMcpConfiguration()} aria-label="Copy MCP configuration">{mcpCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{mcpCopied ? 'Copied' : 'Copy'}</button></div>
            <pre><code>{mcpJson}</code></pre>
          </div> : <div className="mcp-unavailable">Start the local GeekHeros agent to generate an MCP connection.</div>}
          <div className="setup-note mcp-setup-note"><span><Info aria-hidden="true" /></span><p>Give this JSON only to an agent running on this computer. The endpoint is loopback-only, requires <code>npm run dev</code> to stay running, and the embedded bearer token should be treated like a password.</p></div>
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
          <div><h2>Lovable build environment</h2><p>GeekHeros creates projects through Lovable’s connected MCP service, imports their source directly, runs a controlled Node 22 build and selects a production runtime for the generated framework.</p></div>
          <div className="setup-note"><span><Info aria-hidden="true" /></span><p>GitHub and GitLab are optional for direct Lovable launches. Lovable authorization is never exposed to build containers.</p></div>
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

function LaunchChoiceModal({ onClose, onChoose }: { onClose: () => void; onChoose: (kind: SiteKind) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal launch-choice-modal" role="dialog" aria-modal="true" aria-labelledby="launch-choice-title"><div className="modal-head"><div><p className="eyebrow">NEW DOCKER SITE</p><h2 id="launch-choice-title">Choose a site source</h2><p>Both options use the same GeekHeros clients, tags, container profiles, routing and lifecycle controls.</p></div><button onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button></div><div className="launch-choice-grid"><button onClick={() => onChoose('wordpress')}><span className="launch-choice-icon wordpress-choice"><Container aria-hidden="true" /></span><strong>WordPress</strong><p>Install WordPress and MariaDB with persistent volumes and one-click WP Admin.</p><em>Launch WordPress<ArrowRight aria-hidden="true" /></em></button><button onClick={() => onChoose('lovable')}><span className="launch-choice-icon lovable-choice"><Sparkles aria-hidden="true" /></span><strong>Lovable build</strong><p>Create the project in your connected workspace, then build and host its source directly in Docker.</p><em>Launch Lovable<ArrowRight aria-hidden="true" /></em></button></div></section></div>; }

function WordPressLaunchModal({ clients, blueprints, defaultBlueprintId, busy, onBack, onClose, onSubmit }: { clients: Client[]; blueprints: Blueprint[]; defaultBlueprintId: string; busy: boolean; onBack: () => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><div className="modal-head"><div><p className="eyebrow">WORDPRESS WORKLOAD</p><h2 id="launch-title">Launch WordPress</h2><p>Creates isolated WordPress and MariaDB containers, persistent volumes, networking and edge routing.</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={onSubmit}><input type="hidden" name="kind" value="wordpress" /><div className="form-grid"><label>Site name<input name="name" required maxLength={80} placeholder="Client marketing site" autoFocus /></label><label>Domain<input name="domain" required placeholder="client.localhost" /></label><label>Client<select name="clientId" defaultValue=""><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Container profile<select name="pod" defaultValue="Standard"><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select></label><label className="full-field">Tags<input name="tags" placeholder="production, managed, ecommerce" /></label><label className="full-field">WordPress blueprint<select name="blueprintId" defaultValue={defaultBlueprintId}><option value="">Default — Clean WordPress install</option>{blueprints.map((blueprint) => <option value={blueprint.id} key={blueprint.id}>{blueprint.name} — {blueprintItemCount(blueprint)} setup item{blueprintItemCount(blueprint) === 1 ? '' : 's'}</option>)}</select><small>Choose Default for a clean installation, or apply a saved package before the site becomes available.</small></label><label>Administrator username<input name="adminUser" required defaultValue="admin" autoComplete="username" /></label><label>Administrator email<input name="adminEmail" type="email" required placeholder="admin@example.com" autoComplete="email" /></label><label className="full-field">Administrator password<input name="adminPassword" type="password" required minLength={12} placeholder="At least 12 characters" autoComplete="new-password" /></label></div><div className="launch-footnote"><span><Info aria-hidden="true" /></span><p>The password is used during installation and is not exposed in Docker labels or activity logs. Blueprint files stay on this machine and are copied into the new WordPress volume during setup.</p></div><div className="modal-actions"><button type="button" className="secondary-button back-choice" onClick={onBack} disabled={busy}><ArrowLeft aria-hidden="true" />Change source</button><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Starting containers…' : 'Launch WordPress'}</button></div></form></section></div>; }

function LovableLaunchModal({ clients, busy, onBack, onClose, onOpenSettings, onSubmit }: { clients: Client[]; busy: boolean; onBack: () => void; onClose: () => void; onOpenSettings: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [connection, setConnection] = useState<LovableConnection>({ connected: false, account: null, workspaces: [], connectedAt: null });
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch('/api/lovable', { cache: 'no-store' }).then(async (response) => {
      const result = await response.json() as LovableConnection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Lovable connection status is unavailable.');
      if (active) setConnection(result);
    }).catch((failure) => { if (active) setConnectionError(messageFrom(failure, 'Lovable connection status is unavailable.')); })
      .finally(() => { if (active) setConnectionLoading(false); });
    return () => { active = false; };
  }, []);

  const locked = busy;
  const canLaunch = connection.connected && connection.workspaces.length > 0;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !locked) onClose(); }}>
    <section className="modal lovable-launch-modal" role="dialog" aria-modal="true" aria-labelledby="lovable-launch-title">
      <div className="modal-head"><div><p className="eyebrow">LOVABLE WORKLOAD</p><h2 id="lovable-launch-title">Build with Lovable</h2><p>Create the project through your linked Lovable account, then let GeekHeros import, build and host its source directly in Docker.</p></div><button onClick={onClose} disabled={locked} aria-label="Close"><X aria-hidden="true" /></button></div>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="kind" value="lovable" />
        <input type="hidden" name="sourceProvider" value="lovable" />
        <div className="lovable-workflow"><span>1</span><p><strong>Generate</strong>Create the project through the linked Lovable account.</p><span>2</span><p><strong>Import</strong>Read the generated source directly from Lovable.</p><span>3</span><p><strong>Host</strong>Build the project and launch its Docker container.</p></div>
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
          {connection.connected && !connection.workspaces.length && <div className="full-field lovable-builder-action"><button type="button" className="secondary-button" onClick={onOpenSettings}><Settings aria-hidden="true" />Review Lovable connection</button><strong className="connector-error" role="alert">The connected account does not expose a workspace where GeekHeros can create this project.</strong></div>}
          {connection.connected && connection.workspaces.length > 0 && <label className="full-field">Lovable workspace<select name="lovableWorkspaceId" defaultValue={connection.workspaces[0]?.id || ''} required><option value="" disabled>Choose a workspace</option>{connection.workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select><small>The new project will be created in this workspace.</small></label>}
          <label className="full-field">Frontend build variables<textarea name="buildEnvironment" rows={4} placeholder={'VITE_SUPABASE_URL=https://…\nVITE_SUPABASE_PUBLISHABLE_KEY=…'} /><small>Optional VITE_ variables, one KEY=value per line. These values are compiled into the browser bundle, so do not use server secrets.</small></label>
        </div>
        <div className="launch-footnote"><span><Info aria-hidden="true" /></span><p>Launching creates a real Lovable project and uses your Lovable credits. GeekHeros then imports its source and uses a controlled Node 22 production build—no Git repository is required.</p></div>
        <div className="modal-actions"><button type="button" className="secondary-button back-choice" onClick={onBack} disabled={locked}><ArrowLeft aria-hidden="true" />Change source</button><button type="button" className="secondary-button" onClick={onClose} disabled={locked}>Cancel</button><button className="primary-button" disabled={locked || connectionLoading || !canLaunch}>{busy ? 'Building container…' : 'Create & launch'}</button></div>
      </form>
    </section>
  </div>;
}

function WordPressPluginRepositoryModal({ blueprints, pluginLibrary, initialBlueprintId, busy, onClose, onDownload }: { blueprints: Blueprint[]; pluginLibrary: PluginLibraryItem[]; initialBlueprintId: string | null; busy: boolean; onClose: () => void; onDownload: (blueprintId: string | null, slugs: string[]) => Promise<boolean> }) {
  const [blueprintId, setBlueprintId] = useState(initialBlueprintId || '');
  const [query, setQuery] = useState('');
  const [repository, setRepository] = useState<WordPressPluginSearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const target = blueprints.find((blueprint) => blueprint.id === blueprintId) || null;

  async function search(page = 1) {
    const term = query.trim();
    if (term.length < 2) { setError('Enter at least 2 characters to search WordPress.org.'); return; }
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ query: term, page: String(page), perPage: '8' });
      const response = await apiFetch(`/api/wordpress/plugins?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json() as { repository?: WordPressPluginSearch; error?: string };
      if (!response.ok || !result.repository) throw new Error(result.error || 'WordPress.org plugins could not be loaded.');
      setRepository(result.repository);
      setSelectedSlugs([]);
    } catch (failure) { setError(messageFrom(failure, 'WordPress.org plugins could not be loaded.')); }
    finally { setLoading(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await search(1);
  }

  function togglePlugin(slug: string) {
    setSelectedSlugs((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  }

  async function downloadSelected() {
    if (!selectedSlugs.length) return;
    if (await onDownload(blueprintId || null, selectedSlugs)) setSelectedSlugs([]);
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <section className="modal plugin-repository-modal" role="dialog" aria-modal="true" aria-labelledby="plugin-repository-title">
      <div className="modal-head"><div><p className="eyebrow">OFFICIAL WORDPRESS.ORG REPOSITORY</p><h2 id="plugin-repository-title">Build your plugin library</h2><p>Select several plugins at once. Keep them reusable in the library, or add the same mix to a blueprint.</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div>
      <div className="plugin-repository-controls">
        <form className="plugin-search-form" onSubmit={submit}><label>Search plugins<input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={100} placeholder="SEO, forms, security…" autoFocus /></label><button className="primary-button" disabled={loading || busy || query.trim().length < 2}><Search aria-hidden="true" />{loading ? 'Searching…' : 'Search'}</button></form>
        <label>Also add to blueprint<select value={blueprintId} onChange={(event) => setBlueprintId(event.target.value)} disabled={busy}><option value="">No blueprint — library only</option>{blueprints.map((blueprint) => <option key={blueprint.id} value={blueprint.id}>{blueprint.name}</option>)}</select><small>{target ? `Selected plugins will also be added to ${target.name}.` : 'Plugins stay reusable and can be mixed into blueprints later.'}</small></label>
      </div>
      {error && <p className="plugin-repository-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p>}
      {!repository && !error && <div className="plugin-repository-intro"><span><Download aria-hidden="true" /></span><strong>Search the live WordPress.org catalog</strong><p>Select any combination of plugins and download their official ZIPs together. Your library remains available when you edit another blueprint.</p></div>}
      {repository && <>
        <div className="plugin-search-summary" aria-live="polite"><span><strong>{repository.total.toLocaleString()}</strong> result{repository.total === 1 ? '' : 's'} for “{repository.query}”</span><small>Select plugins to download · Page {repository.page} of {Math.max(1, repository.pages)}</small></div>
        <div className="plugin-repository-results">{repository.plugins.map((plugin) => {
          const stored = pluginLibrary.find((item) => item.slug === plugin.slug) || null;
          const assigned = target?.files.some((file) => file.source?.provider === 'wordpress.org' && file.source.slug === plugin.slug) || false;
          const selected = selectedSlugs.includes(plugin.slug);
          return <article className={`plugin-repository-card ${selected ? 'selected' : ''}`} key={plugin.slug}>
            <div className="plugin-card-heading"><span className="plugin-repository-icon"><Package aria-hidden="true" /></span><div><h3>{plugin.name}</h3><span>{plugin.slug} · v{plugin.version}</span></div><button className="plugin-select" aria-pressed={selected} onClick={() => togglePlugin(plugin.slug)}>{selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}<span>{selected ? 'Selected' : 'Select'}</span></button></div>
            <p>{plugin.shortDescription || 'No description supplied by the plugin author.'}</p>
            <div className="plugin-repository-meta"><span>{formatPluginRating(plugin.rating)} rating</span><span>{formatCompactNumber(plugin.activeInstalls)} active installs</span><span>{plugin.testedWordPress ? `WP ${plugin.testedWordPress}` : plugin.requiresWordPress ? `Requires WP ${plugin.requiresWordPress}` : 'Compatibility not listed'}</span></div>
            <div className="plugin-card-footer"><span>{stored ? `In library · v${stored.version}` : 'Not downloaded'}{assigned ? ' · In blueprint' : ''}</span><a href={plugin.pluginUrl} target="_blank" rel="noreferrer">Plugin details<ExternalLink aria-hidden="true" /></a></div>
          </article>;
        })}{!repository.plugins.length && <Empty title="No plugins found" copy="Try a broader plugin name or feature." />}</div>
        {repository.pages > 1 && <div className="plugin-repository-pagination"><button className="secondary-button" disabled={loading || busy || repository.page <= 1} onClick={() => void search(repository.page - 1)}><ArrowLeft aria-hidden="true" />Previous</button><span>Page {repository.page} of {repository.pages}</span><button className="secondary-button" disabled={loading || busy || repository.page >= repository.pages} onClick={() => void search(repository.page + 1)}>Next<ArrowRight aria-hidden="true" /></button></div>}
      </>}
      <div className="plugin-download-bar"><div><strong>{selectedSlugs.length} plugin{selectedSlugs.length === 1 ? '' : 's'} selected</strong><span>{target ? `Save to library and ${target.name}` : 'Save to reusable plugin library only'}</span></div><button className="primary-button" disabled={busy || !selectedSlugs.length} onClick={() => void downloadSelected()}><Download aria-hidden="true" />{busy ? 'Downloading…' : `Download selected${selectedSlugs.length ? ` (${selectedSlugs.length})` : ''}`}</button></div>
      <div className="plugin-repository-footnote"><ShieldCheck aria-hidden="true" /><p>Only official <strong>downloads.wordpress.org</strong> ZIPs are accepted. Every file is validated and hashed before storage.</p></div>
    </section>
  </div>;
}

function BlueprintModal({ blueprint, pluginLibrary, busy, onClose, onSubmit }: { blueprint: Blueprint | null; pluginLibrary: PluginLibraryItem[]; busy: boolean; onClose: () => void; onSubmit: (input: BlueprintInput) => Promise<void> }) {
  const [uploads, setUploads] = useState<BlueprintUpload[]>([]);
  const [retainedFileIds, setRetainedFileIds] = useState(() => blueprint?.files.filter((file) => !file.source?.libraryPluginId).map((file) => file.id) || []);
  const [libraryPluginIds, setLibraryPluginIds] = useState(() => [...new Set(blueprint?.files.map((file) => file.source?.libraryPluginId).filter((id): id is string => Boolean(id)) || [])]);
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

  function toggleLibraryPlugin(id: string) {
    setLibraryPluginIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
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
        libraryPluginIds,
        retainedFileIds,
        files,
      });
    } catch (failure) { setError(messageFrom(failure, 'The blueprint could not be saved.')); }
    finally { setPreparing(false); }
  }

  const existingFiles = blueprint?.files.filter((file) => !file.source?.libraryPluginId) || [];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !locked) onClose(); }}><section className="modal blueprint-modal" role="dialog" aria-modal="true" aria-labelledby="blueprint-modal-title"><div className="modal-head"><div><p className="eyebrow">WORDPRESS STARTER</p><h2 id="blueprint-modal-title">{blueprint ? 'Edit blueprint' : 'Add blueprint'}</h2><p>{blueprint ? 'Change the plugin mix, packages and configuration used by future launches.' : 'Bundle the packages and configuration that turn a clean WordPress install into your standard starting point.'}</p></div><button onClick={onClose} disabled={locked} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={submit}><div className="form-grid"><label>Blueprint name<input name="name" required maxLength={100} defaultValue={blueprint?.name || ''} placeholder="Agency marketing starter" autoFocus /></label><label>Description<input name="description" maxLength={500} defaultValue={blueprint?.description || ''} placeholder="SEO, forms, security and base pages" /></label><label>WordPress.org plugin slugs<textarea name="plugins" rows={4} defaultValue={blueprint?.plugins.map((plugin) => plugin.slug).join('\n') || ''} placeholder={'wordpress-seo\nwordfence\nwpforms-lite'} /><small>Catalog slugs are installed live at launch. Library plugins below use saved, versioned ZIPs.</small></label><label>WordPress.org theme slugs<textarea name="themes" rows={4} defaultValue={blueprint?.themes.map((theme) => theme.slug).join('\n') || ''} placeholder="astra" /><small>One theme is activated after installation; list the preferred active theme last.</small></label><div className="full-field blueprint-library-picker"><div><span>Plugin library</span><small>Select any combination of downloaded plugins for this blueprint.</small></div>{pluginLibrary.length ? <div>{pluginLibrary.map((plugin) => { const selected = libraryPluginIds.includes(plugin.id); return <label className={selected ? 'selected' : ''} key={plugin.id}><input type="checkbox" checked={selected} onChange={() => toggleLibraryPlugin(plugin.id)} /><span><strong>{plugin.name}</strong><small>{plugin.slug} · v{plugin.version} · {formatBytes(plugin.size)}</small></span><i>{selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}</i></label>; })}</div> : <p>No plugins are in the reusable library yet. Use Browse plugins on the Blueprints page to download some.</p>}</div>{existingFiles.length > 0 && <div className="full-field blueprint-existing-files"><div><span>Existing files</span><small>Keep or remove files already stored in this blueprint.</small></div>{existingFiles.map((file) => { const kept = retainedFileIds.includes(file.id); return <button type="button" className={kept ? '' : 'removed'} onClick={() => setRetainedFileIds((current) => kept ? current.filter((id) => id !== file.id) : [...current, file.id])} key={file.id}><ArchiveRestore aria-hidden="true" /><span><strong>{file.source?.name || file.name}</strong><small>{file.source ? `WordPress.org ZIP · v${file.source.version}` : `${blueprintFileKindLabel(file.kind)} · ${formatBytes(file.size)}`}</small></span><em>{kept ? 'Keep' : 'Remove'}</em></button>; })}</div>}<label className="full-field blueprint-upload"><span>Add files</span><input type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} /><small>Add plugin or theme ZIPs, settings JSON, WordPress export XML, must-use plugin PHP, or any file that belongs under wp-content.</small></label><div className="full-field blueprint-upload-list">{uploads.map((upload) => <div className="blueprint-upload-row" key={upload.id}><span><strong>{upload.file.name}</strong><small>{formatBytes(upload.file.size)}</small></span><select aria-label={`Purpose for ${upload.file.name}`} value={upload.kind} onChange={(event) => updateUpload(upload.id, { kind: event.target.value as BlueprintFileKind })}>{blueprintKindsForFile(upload.file.name).map((kind) => <option key={kind} value={kind}>{blueprintFileKindLabel(kind)}</option>)}</select>{upload.kind === 'wp-content' && <input aria-label={`Destination for ${upload.file.name}`} value={upload.destination} onChange={(event) => updateUpload(upload.id, { destination: event.target.value })} placeholder={`wp-content/blueprint-files/${upload.file.name}`} />}<button type="button" onClick={() => setUploads((current) => current.filter((item) => item.id !== upload.id))} aria-label={`Remove ${upload.file.name}`}><X aria-hidden="true" /></button></div>)}{!uploads.length && <p>No new files selected.</p>}</div></div><div className="blueprint-json-note"><Info aria-hidden="true" /><p><strong>Settings JSON format</strong>Use the top-level fields <code>options</code>, <code>plugins</code>, <code>themes</code> and <code>pages</code>. Unknown fields are rejected so a bad export cannot silently misconfigure a launch.</p><button type="button" onClick={downloadBlueprintSettingsExample}>Download example JSON</button></div>{error && <p className="blueprint-form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={locked}>Cancel</button><button className="primary-button" disabled={locked}>{locked ? 'Saving blueprint…' : blueprint ? 'Save changes' : 'Add blueprint'}</button></div></form></section></div>;
}

function CreateStagingModal({ productionSites, busy, onClose, onSubmit }: { productionSites: Site[]; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [productionSiteId, setProductionSiteId] = useState(productionSites[0]?.id || '');
  const source = productionSites.find((site) => site.id === productionSiteId) || null;
  const [name, setName] = useState(source ? `${source.name} Staging` : '');
  const [domain, setDomain] = useState(source ? stagingDomainFor(source.domain) : '');
  function chooseProduction(id: string) {
    const next = productionSites.find((site) => site.id === id);
    setProductionSiteId(id);
    setName(next ? `${next.name} Staging` : '');
    setDomain(next ? stagingDomainFor(next.domain) : '');
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="modal staging-modal" role="dialog" aria-modal="true" aria-labelledby="staging-modal-title"><div className="modal-head"><div><p className="eyebrow">SAFE WORDPRESS WORKFLOW</p><h2 id="staging-modal-title">Create staging</h2><p>Clone a production WordPress site into a completely isolated local environment.</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X aria-hidden="true" /></button></div><form onSubmit={onSubmit}><div className="staging-workflow"><span>1</span><p><strong>Clone</strong>Copy WordPress files and database.</p><span>2</span><p><strong>Test</strong>Work safely with email and indexing blocked.</p><span>3</span><p><strong>Promote</strong>Back up production and push changes live.</p></div><div className="form-grid"><label className="full-field">Production WordPress site<select name="productionSiteId" value={productionSiteId} onChange={(event) => chooseProduction(event.target.value)} required autoFocus><option value="" disabled>Choose a production site</option>{productionSites.map((site) => <option value={site.id} key={site.id}>{site.name} — {site.domain}</option>)}</select><small>Each production WordPress site can have one isolated staging environment.</small></label><label>Staging name<input name="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Client Site Staging" /></label><label>Staging domain<input name="domain" required value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="staging.client.localhost" /></label><label className="full-field">Container profile<select name="pod" defaultValue={source?.pod || 'Standard'} key={source?.id || 'none'}><option>Micro</option><option>Standard</option><option>Performance</option><option>Power</option></select><small>Defaults to the same resource profile as production.</small></label></div><div className="launch-footnote"><span><ShieldCheck aria-hidden="true" /></span><p>The production site is read-only during cloning. Staging gets its own database, files, network, hostname and containers. URLs are rewritten automatically, and production is never overwritten until you explicitly choose Push to production.</p></div>{!productionSites.length && <p className="staging-form-error" role="alert">Every production WordPress site already has staging, or no WordPress production site exists yet.</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy || !source}>{busy ? 'Cloning production…' : 'Create staging'}</button></div></form></section></div>;
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
function stagingDomainFor(domain: string) { return `staging.${domain.replace(/^staging\./, '')}`; }
function fileToBase64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(`${file.name} could not be read.`)); reader.onload = () => { const result = String(reader.result || ''); const separator = result.indexOf(','); if (separator < 0) reject(new Error(`${file.name} could not be encoded.`)); else resolve(result.slice(separator + 1)); }; reader.readAsDataURL(file); }); }
function downloadBlueprintSettingsExample() { const example = { options: { blogdescription: 'A concise site tagline', timezone_string: 'America/Los_Angeles', default_comment_status: 'closed' }, plugins: [{ slug: 'wordpress-seo', activate: true }], themes: [{ slug: 'astra', activate: true }], pages: [{ title: 'Home', slug: 'home', status: 'publish', content: '<h1>Welcome</h1>' }] }; const url = URL.createObjectURL(new Blob([`${JSON.stringify(example, null, 2)}\n`], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'geekheros-blueprint-settings.json'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
function shortRevision(value: string | null) { return value ? value.slice(0, 8) : 'Not deployed'; }
function formatBytes(value: number) { if (!value) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`; }
function formatCompactNumber(value: number) { return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function formatPluginRating(value: number) { return `${(value / 20).toFixed(1)} / 5`; }
function analyticsRangeLabel(days: AnalyticsRangeDays) { return days === 1 ? 'Last 24 hours' : `Last ${days} days`; }
function formatAnalyticsPercent(value: number | null) { if (value === null) return '—'; return `${value.toFixed(Number.isInteger(value) ? 0 : 2)}%`; }
function analyticsAxisLabel(value: string, days: AnalyticsRangeDays) { const date = new Date(value); return days === 1 ? date.toLocaleTimeString([], { hour: 'numeric' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function humanizeOperation(value: string) { return value.split(/[._-]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' '); }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function relativeTimeFuture(value: string) { const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000)); if (seconds < 60) return 'in less than a minute'; if (seconds < 3600) return `in ${Math.ceil(seconds / 60)} minutes`; if (seconds < 86400) return `in ${Math.ceil(seconds / 3600)} hours`; return `in ${Math.ceil(seconds / 86400)} days`; }
function backupIntervalLabel(hours: number) { return backupIntervalOptions.find((option) => option.hours === hours)?.label || `Every ${hours} hours`; }
function backupTriggerLabel(trigger?: Backup['trigger']) { return trigger === 'automatic' ? 'Automatic' : trigger === 'system' ? 'Safety backup' : trigger === 'manual' ? 'Manual' : 'Recovery point'; }
function messageFrom(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
function operationLabel(type: string) { return ({ start: 'start', stop: 'stop', restart: 'restart', refresh: 'inventory refresh', backup: 'backup', update: 'full update', redeploy: 'source deployment', 'update-core': 'core update', 'update-plugins': 'plugin update', 'update-themes': 'theme update', 'activate-plugin': 'plugin activation', 'deactivate-plugin': 'plugin deactivation', 'activate-theme': 'theme activation', scan: 'checksum scan', delete: 'deletion' } as Record<string, string>)[type] || type; }
