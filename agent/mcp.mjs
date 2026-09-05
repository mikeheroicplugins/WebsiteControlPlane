import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

export const controlPlaneMcpToolCount = 58;

const siteIdSchema = z.string().min(1).describe('Managed site ID returned by list_sites or list_staging_sites.');
const clientIdSchema = z.string().min(1).describe('Client ID returned by list_clients.');
const blueprintIdSchema = z.string().min(1).describe('Blueprint ID returned by list_blueprints.');
const pluginLibraryIdSchema = z.string().regex(/^plugin_[a-f0-9]{12}$/).describe('Plugin library ID returned by list_plugin_library.');
const agentIdSchema = z.string().min(1).describe('MCP agent ID returned by list_agents.');
const packageNamesSchema = z.array(z.string().min(1)).max(100).optional();
const porkbunModeSchema = z.enum(['sandbox', 'live']).describe('Porkbun Test (sandbox) or Live account. Omit to use the dashboard toggle.');
const porkbunDomainSchema = z.string().min(3).max(253).describe('Fully qualified domain name without a protocol or path.');
const porkbunJsonSchema = z.record(z.string(), z.unknown()).default({});

function mcpResult(result) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: { result },
  };
}

function register(server, name, config, handler) {
  server.registerTool(name, config, async (args) => mcpResult(await handler(args || {})));
}

function registerRaw(server, name, config, handler) {
  server.registerTool(name, config, async (args) => handler(args || {}));
}

function createControlPlaneMcpServer(api) {
  const server = new McpServer({ name: 'GeekHeros Control Plane', version: '0.1.0' }, {
    instructions: 'Manage the geekheros.com control plane. Read current state before changing it, and confirm intent before destructive operations.',
  });

  register(server, 'get_system_info', {
    title: 'Get system information',
    description: 'Read hosting node, gateway, agent and managed-site health.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.getSystemInfo());

  register(server, 'get_runtime_diagnostics', {
    title: 'Get hosting readiness',
    description: 'Read deployment mode, persistent storage availability and free space, management URL, runtime version and service uptime. Does not return credentials or change services.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.getRuntimeDiagnostics());

  register(server, 'list_activity', {
    title: 'List activity',
    description: 'Read the control-plane audit log, optionally for one managed site.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50), siteId: z.string().min(1).optional() }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ limit, siteId }) => api.listActivity({ limit, siteId }));

  register(server, 'get_analytics', {
    title: 'Get control-plane analytics',
    description: 'Read fleet-wide or site-specific uptime, latency, operations, backups, health distribution and granular monitoring measurements for a selected time range. Every value is derived from observed local records; the response never contains simulated or sample data.',
    inputSchema: z.object({
      rangeDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(7),
      siteId: siteIdSchema.optional(),
      environment: z.enum(['all', 'production', 'staging']).default('all'),
      kind: z.enum(['all', 'wordpress', 'lovable']).default('all'),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, (input) => api.getAnalytics(input));

  register(server, 'get_domain_provider_status', {
    title: 'Get Porkbun connection status',
    description: 'Read the active Test/Live mode, masked credential status and available domain-operation count. Secret keys are never returned.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.getPorkbunStatus());

  register(server, 'configure_porkbun_credentials', {
    title: 'Configure Porkbun credentials',
    description: 'Store a Porkbun public and secret API key pair in ignored local control-plane state. Existing credentials are never readable through MCP.',
    inputSchema: z.object({
      mode: porkbunModeSchema,
      apiKey: z.string().min(8).max(300).describe('Porkbun public API key.'),
      secretApiKey: z.string().min(8).max(300).describe('Porkbun secret API key.'),
      activate: z.boolean().default(false).describe('Also make this the active dashboard mode.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, (input) => api.configurePorkbun(input));

  register(server, 'set_domain_mode', {
    title: 'Set domain mode',
    description: 'Switch the Domains dashboard and default MCP domain operations between Porkbun Test and Live credentials.',
    inputSchema: z.object({ mode: porkbunModeSchema }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => api.setPorkbunMode(input));

  register(server, 'list_domain_api_operations', {
    title: 'List Porkbun API operations',
    description: 'List every Porkbun v3 operation exposed by the Domains page and call_domain_api, including required path parameters and risk metadata.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listPorkbunOperations());

  register(server, 'call_domain_api', {
    title: 'Call Porkbun domain API',
    description: 'Call any allowlisted Porkbun v3 operation exposed in the Domains advanced console. Mutating operations require confirm=true; billable operations should be dry-run first when supported.',
    inputSchema: z.object({
      operationId: z.string().min(1).max(100).describe('Operation ID returned by list_domain_api_operations.'),
      mode: porkbunModeSchema.optional(),
      pathParameters: porkbunJsonSchema.describe('Values for placeholders such as domain, id, type or subdomain.'),
      query: porkbunJsonSchema.describe('Optional query-string parameters.'),
      body: porkbunJsonSchema.describe('JSON request body without credentials.'),
      confirm: z.boolean().default(false).describe('Required for a state-changing operation after its mode and payload have been reviewed.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, (input) => api.callPorkbunApi(input));

  register(server, 'search_domain', {
    title: 'Search domain availability',
    description: 'Check a domain name in Porkbun and return live availability plus registration, renewal and transfer pricing. Porkbun rate-limits checks.',
    inputSchema: z.object({ domain: porkbunDomainSchema, mode: porkbunModeSchema.optional() }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, ({ domain, mode }) => api.callPorkbunApi({ operationId: 'domainCheckDomain', mode, pathParameters: { domain } }));

  register(server, 'list_registered_domains', {
    title: 'List Porkbun domains',
    description: 'List real domains in the selected Porkbun account with lifecycle, expiration, privacy, lock and auto-renew state.',
    inputSchema: z.object({
      mode: porkbunModeSchema.optional(), start: z.number().int().min(0).default(0), nameContains: z.string().max(253).optional(),
      expiringWithinDays: z.number().int().min(0).max(3650).optional(), autoRenew: z.enum(['yes', 'no']).optional(),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, ({ mode, ...query }) => api.callPorkbunApi({ operationId: 'getDomains', mode, query: { ...query, includeLabels: 'yes' } }));

  register(server, 'register_domain', {
    title: 'Register Porkbun domain',
    description: 'Register a domain at the exact quoted cost in cents. Run search_domain first. dryRun=true performs preflight only; a real registration requires confirm=true and agrees to Porkbun terms.',
    inputSchema: z.object({
      domain: porkbunDomainSchema, cost: z.number().int().min(1), mode: porkbunModeSchema.optional(),
      whoisPrivacy: z.boolean().default(true), dryRun: z.boolean().default(true), confirm: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, ({ domain, mode, cost, whoisPrivacy, dryRun, confirm }) => api.callPorkbunApi({ operationId: 'domainCreate', mode, pathParameters: { domain }, body: { cost, agreeToTerms: 'yes', whoisPrivacy, dryRun }, confirm }));

  register(server, 'renew_domain', {
    title: 'Renew Porkbun domain',
    description: 'Renew a domain at the exact quoted cost in cents. dryRun=true performs preflight only; a real renewal requires confirm=true.',
    inputSchema: z.object({ domain: porkbunDomainSchema, cost: z.number().int().min(1), mode: porkbunModeSchema.optional(), dryRun: z.boolean().default(true), confirm: z.boolean().default(false) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, ({ domain, mode, cost, dryRun, confirm }) => api.callPorkbunApi({ operationId: 'domainRenew', mode, pathParameters: { domain }, body: { cost, dryRun }, confirm }));

  register(server, 'set_domain_auto_renew', {
    title: 'Set domain auto-renew',
    description: 'Turn Porkbun automatic renewal on or off for one or more domains. Requires confirm=true.',
    inputSchema: z.object({ domain: porkbunDomainSchema, status: z.enum(['on', 'off']), additionalDomains: z.array(porkbunDomainSchema).max(100).default([]), mode: porkbunModeSchema.optional(), confirm: z.boolean().default(false) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, ({ domain, status, additionalDomains, mode, confirm }) => api.callPorkbunApi({ operationId: 'domainUpdateAutoRenew', mode, pathParameters: { domain }, body: { status, domains: additionalDomains }, confirm }));

  register(server, 'manage_domain_dns', {
    title: 'Manage Porkbun DNS',
    description: 'List, create, edit or delete Porkbun DNS records. Changes require confirm=true; create supports dry-run validation.',
    inputSchema: z.object({
      domain: porkbunDomainSchema, action: z.enum(['list', 'create', 'edit', 'delete']), mode: porkbunModeSchema.optional(),
      id: z.string().max(100).optional(), type: z.enum(['A', 'AAAA', 'MX', 'CNAME', 'ALIAS', 'TXT', 'NS', 'SRV', 'TLSA', 'CAA', 'SSHFP', 'HTTPS', 'SVCB']).optional(),
      name: z.string().max(253).optional(), content: z.string().max(10_000).optional(), ttl: z.number().int().min(0).optional(),
      priority: z.number().int().min(0).optional(), notes: z.string().max(1_000).optional(), dryRun: z.boolean().default(false), confirm: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, ({ domain, action, mode, id, type, name, content, ttl, priority, notes, dryRun, confirm }) => {
    if (action === 'list') return api.callPorkbunApi({ operationId: 'getDnsRecords', mode, pathParameters: { domain } });
    if ((action === 'edit' || action === 'delete') && !id) throw new Error(`DNS record ID is required for ${action}.`);
    if ((action === 'create' || action === 'edit') && (!type || !content)) throw new Error(`DNS type and content are required for ${action}.`);
    const operationId = action === 'create' ? 'dnsCreate' : action === 'edit' ? 'dnsEdit' : 'dnsDelete';
    return api.callPorkbunApi({ operationId, mode, pathParameters: { domain, id }, body: action === 'delete' ? {} : { type, name, content, ttl, prio: priority, notes, ...(action === 'create' ? { dryRun } : {}) }, confirm });
  });

  register(server, 'list_sites', {
    title: 'List sites',
    description: 'List every production WordPress and Lovable site with live container state. Use list_staging_sites for staging environments.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listSites());

  register(server, 'launch_site', {
    title: 'Launch site',
    description: 'Launch a WordPress or Lovable workload with every option available in the dashboard.',
    inputSchema: z.object({
      name: z.string().min(1).max(80),
      domain: z.string().min(1).max(253),
      kind: z.enum(['wordpress', 'lovable']).default('wordpress'),
      pod: z.enum(['Micro', 'Standard', 'Performance', 'Power']).default('Standard'),
      clientId: z.string().nullable().optional(),
      tags: z.array(z.string()).max(20).optional(),
      blueprintId: z.string().nullable().optional(),
      adminUser: z.string().optional(),
      adminEmail: z.string().optional(),
      adminPassword: z.string().optional().describe('Required for WordPress; minimum 12 characters.'),
      lovablePrompt: z.string().max(50_000).optional(),
      sourceProvider: z.enum(['lovable', 'git']).default('lovable').describe('Use lovable for one-click project creation and direct source import, or git for an existing synced repository.'),
      lovableWorkspaceId: z.string().max(200).optional().describe('Lovable workspace ID from get_lovable_connection. Required when multiple workspaces are available and sourceProvider is lovable.'),
      lovableProjectId: z.string().max(200).optional(),
      lovableProjectUrl: z.string().optional(),
      imageUrls: z.array(z.string().url()).max(10).optional(),
      htmlUrls: z.array(z.string().url()).max(10).optional(),
      repositoryUrl: z.string().optional().describe('Required only when sourceProvider is git.'),
      repositoryBranch: z.string().max(200).optional().describe('Optional Lovable Git branch. Omit it to detect the repository default branch automatically.'),
      repositoryToken: z.string().max(500).optional(),
      buildEnvironment: z.record(z.string(), z.string()).optional().describe('Lovable frontend VITE_ variables.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => api.launchSite({
    ...input,
    buildEnvironment: Object.entries(input.buildEnvironment || {}).map(([key, value]) => `${key}=${value}`).join('\n'),
  }));

  register(server, 'list_staging_sites', {
    title: 'List WordPress staging sites',
    description: 'List isolated WordPress staging environments, their linked production sites, sync state and live container status.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listStagingSites());

  register(server, 'create_staging_site', {
    title: 'Create WordPress staging site',
    description: 'Clone a production WordPress site into isolated containers, volumes, database and hostname with crawler blocking and outbound email suppression.',
    inputSchema: z.object({
      productionSiteId: siteIdSchema,
      name: z.string().min(1).max(80).optional(),
      domain: z.string().min(1).max(253).optional().describe('Defaults to staging.<production-domain>.'),
      pod: z.enum(['Micro', 'Standard', 'Performance', 'Power']).optional().describe('Defaults to the production site profile.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (input) => api.createStagingSite(input));

  register(server, 'manage_staging_site', {
    title: 'Manage WordPress staging site',
    description: 'Refresh staging from production, promote staging to production, or delete staging. Sync and promotion create a safety recovery point before replacing data.',
    inputSchema: z.object({
      stagingSiteId: siteIdSchema.describe('Staging site ID returned by list_staging_sites.'),
      action: z.enum(['sync', 'promote', 'delete']),
      scope: z.enum(['all', 'files', 'database']).default('all').describe('Files, database, or both. Ignored for delete.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ stagingSiteId, action, scope }) => api.manageStagingSite(stagingSiteId, action, { scope }));

  register(server, 'update_site_metadata', {
    title: 'Update site metadata',
    description: 'Assign or unassign a client, replace tags, or link a managed Lovable site to an existing Lovable project and workspace.',
    inputSchema: z.object({
      siteId: siteIdSchema,
      clientId: z.string().nullable().optional(),
      tags: z.array(z.string()).max(20).optional(),
      lovableProjectId: z.string().min(1).max(200).optional(),
      lovableWorkspaceId: z.string().min(1).max(200).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, ...input }) => api.updateSiteMetadata(siteId, input));

  register(server, 'get_site_inventory', {
    title: 'Get WordPress inventory',
    description: 'Read WordPress core, plugin, theme, update and backup inventory for a managed WordPress site.',
    inputSchema: z.object({ siteId: siteIdSchema }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId }) => api.getSiteInventory(siteId));

  register(server, 'get_backup_schedule', {
    title: 'Get WordPress backup schedule',
    description: 'Read the manual or automatic backup policy, frequency, next run and last automatic result for a production or staging WordPress site.',
    inputSchema: z.object({ siteId: siteIdSchema }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId }) => api.getBackupSchedule(siteId));

  register(server, 'set_backup_schedule', {
    title: 'Set WordPress backup schedule',
    description: 'Choose manual-only backups or schedule recurring automatic backups for a production or staging WordPress site. A backup can still be run immediately with run_site_operation and operation=backup.',
    inputSchema: z.object({
      siteId: siteIdSchema,
      mode: z.enum(['manual', 'automatic']),
      intervalHours: z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(72), z.literal(168), z.literal(720)]).default(24),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, ...input }) => api.updateBackupSchedule(siteId, input));

  register(server, 'get_backup_history', {
    title: 'Get WordPress backup history',
    description: 'List all recovery points across a linked production WordPress site and its staging environment, plus the valid restore destinations.',
    inputSchema: z.object({ siteId: siteIdSchema }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId }) => api.getBackupHistory(siteId));

  registerRaw(server, 'get_site_screenshot', {
    title: 'Get site screenshot',
    description: 'Capture or read the current 1440×1000 frontend preview for a managed site. Cached previews refresh every 60 minutes.',
    inputSchema: z.object({ siteId: siteIdSchema, refresh: z.boolean().default(false) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ siteId, refresh }) => {
    const screenshot = await api.getSiteScreenshot(siteId, { force: refresh });
    const metadata = { siteId, capturedAt: screenshot.capturedAt, width: screenshot.width, height: screenshot.height };
    return {
      content: [
        { type: 'image', data: screenshot.contents.toString('base64'), mimeType: 'image/png' },
        { type: 'text', text: JSON.stringify(metadata, null, 2) },
      ],
      structuredContent: { result: metadata },
    };
  });

  register(server, 'get_site_monitoring', {
    title: 'Get site monitoring',
    description: 'Read uptime, response latency and recent checks for one site; optionally run a fresh check first.',
    inputSchema: z.object({ siteId: siteIdSchema, refresh: z.boolean().default(false) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, refresh }) => api.getSiteMonitoring(siteId, { refresh }));

  register(server, 'get_site_logs', {
    title: 'Get site logs',
    description: 'Read recent timestamped application and database container logs.',
    inputSchema: z.object({ siteId: siteIdSchema, lines: z.number().int().min(20).max(1000).default(300) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, lines }) => api.getSiteLogs(siteId, { lines }));

  register(server, 'get_site_runtime', {
    title: 'Get site runtime',
    description: 'Read sanitized web-server container, network, port and resource-limit details.',
    inputSchema: z.object({ siteId: siteIdSchema }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId }) => api.getSiteRuntime(siteId));

  register(server, 'run_wp_cli', {
    title: 'Run WP-CLI',
    description: 'Run an audited WP-CLI command using a separate argument array. eval, eval-file, shell, --require and --exec are disabled.',
    inputSchema: z.object({ siteId: siteIdSchema, arguments: z.array(z.string().min(1).max(500)).min(1).max(50) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ siteId, arguments: command }) => api.runSiteWpCli(siteId, command));

  register(server, 'query_site_database', {
    title: 'Query site database',
    description: 'Run SQL against the managed WordPress database. SELECT, SHOW, DESCRIBE and EXPLAIN are read-only; all other statements require allowWrites=true.',
    inputSchema: z.object({ siteId: siteIdSchema, query: z.string().min(1).max(100_000), allowWrites: z.boolean().default(false) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ siteId, query, allowWrites }) => api.querySiteDatabase(siteId, query, { allowWrites }));

  register(server, 'list_site_files', {
    title: 'List site files',
    description: 'List editable source and configuration files inside a WordPress site’s wp-content directory.',
    inputSchema: z.object({ siteId: siteIdSchema, limit: z.number().int().min(10).max(500).default(200) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, limit }) => api.listSiteFiles(siteId, { limit }));

  register(server, 'read_site_file', {
    title: 'Read site file',
    description: 'Read a text or web source file scoped to a WordPress site’s wp-content directory.',
    inputSchema: z.object({ siteId: siteIdSchema, path: z.string().min(1).max(300) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, path }) => api.readSiteFile(siteId, path));

  register(server, 'write_site_file', {
    title: 'Write site file',
    description: 'Create or replace a text or web source file scoped to a WordPress site’s wp-content directory.',
    inputSchema: z.object({ siteId: siteIdSchema, path: z.string().min(1).max(300), content: z.string().max(1_000_000) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, path, content }) => api.writeSiteFile(siteId, path, content));

  register(server, 'run_site_terminal_command', {
    title: 'Run site terminal command',
    description: 'Run an audited command in the site container. Allowed programs: cat, df, du, find, grep, head, ls, php, pwd, stat and tail.',
    inputSchema: z.object({ siteId: siteIdSchema, arguments: z.array(z.string().min(1).max(500)).min(1).max(30) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ siteId, arguments: command }) => api.runSiteTerminalCommand(siteId, command));

  register(server, 'issue_wordpress_login', {
    title: 'Issue WordPress login',
    description: 'Create a single-use WordPress administrator login capability that expires after 60 seconds.',
    inputSchema: z.object({ siteId: siteIdSchema }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ siteId }) => api.issueWordPressLogin(siteId));

  register(server, 'run_site_operation', {
    title: 'Run site operation',
    description: 'Start, stop, restart, refresh, back up, update, redeploy, activate packages or scan a managed site.',
    inputSchema: z.object({
      siteId: siteIdSchema,
      operation: z.enum(['start', 'stop', 'restart', 'refresh', 'backup', 'update', 'redeploy', 'update-core', 'update-plugins', 'update-themes', 'activate-plugin', 'deactivate-plugin', 'activate-theme', 'scan']),
      packages: packageNamesSchema,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, ({ siteId, operation, packages }) => api.runSiteOperation(siteId, operation, { packages }));

  register(server, 'restore_site_backup', {
    title: 'Restore site backup',
    description: 'Create a destination safety recovery point, then restore files, the database, or both from any backup in a linked production/staging WordPress family.',
    inputSchema: z.object({
      siteId: siteIdSchema.describe('WordPress site that owns the backup.'),
      backupId: z.string().uuid(),
      targetSiteId: siteIdSchema.optional().describe('Linked production or staging destination. Defaults to the site that owns the backup.'),
      restoreScope: z.enum(['all', 'files', 'database']).default('all'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ siteId, backupId, targetSiteId, restoreScope }) => api.runSiteOperation(siteId, 'restore-backup', { backupId, targetSiteId, restoreScope }));

  register(server, 'delete_site', {
    title: 'Delete site',
    description: 'Remove a managed site. Set deleteData to remove its containers, volumes, source checkout and backups.',
    inputSchema: z.object({ siteId: siteIdSchema, deleteData: z.boolean().default(false) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ siteId, deleteData }) => api.runSiteOperation(siteId, 'delete', { deleteData }));

  register(server, 'list_clients', {
    title: 'List clients',
    description: 'List client records and assigned site counts.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listClients());

  register(server, 'create_client', {
    title: 'Create client',
    description: 'Create a client record.',
    inputSchema: z.object({ name: z.string().min(1).max(100), company: z.string().max(120).optional(), email: z.string().max(160).optional(), phone: z.string().max(60).optional(), notes: z.string().max(1000).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (input) => api.createClient(input));

  register(server, 'update_client', {
    title: 'Update client',
    description: 'Update any supplied fields on a client record.',
    inputSchema: z.object({ clientId: clientIdSchema, name: z.string().min(1).max(100).optional(), company: z.string().max(120).optional(), email: z.string().max(160).optional(), phone: z.string().max(60).optional(), notes: z.string().max(1000).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ clientId, ...input }) => api.updateClient(clientId, input));

  register(server, 'delete_client', {
    title: 'Delete client',
    description: 'Delete a client record and leave its sites unassigned.',
    inputSchema: z.object({ clientId: clientIdSchema }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ clientId }) => api.deleteClient(clientId));

  register(server, 'list_blueprints', {
    title: 'List blueprints',
    description: 'List reusable WordPress blueprints, packages, files and usage counts.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listBlueprints());

  register(server, 'search_wordpress_plugins', {
    title: 'Search WordPress.org plugins',
    description: 'Search the official WordPress.org plugin repository before choosing a plugin to store in a blueprint.',
    inputSchema: z.object({
      query: z.string().min(2).max(100),
      page: z.number().int().min(1).max(50).default(1),
      perPage: z.number().int().min(1).max(24).default(12),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, (input) => api.searchWordPressPlugins(input));

  register(server, 'list_plugin_library', {
    title: 'List downloaded WordPress plugins',
    description: 'List official WordPress.org plugin ZIPs downloaded to the reusable local plugin library. These plugins are not tied to a blueprint until explicitly selected.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listPluginLibrary());

  register(server, 'delete_plugin_library_item', {
    title: 'Remove downloaded WordPress plugin',
    description: 'Remove a plugin ZIP from the reusable local library. Blueprint copies and existing sites are not changed.',
    inputSchema: z.object({ pluginId: pluginLibraryIdSchema }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ pluginId }) => api.deletePluginLibraryItem(pluginId));

  register(server, 'create_blueprint', {
    title: 'Create blueprint',
    description: 'Create a WordPress blueprint from catalog packages and base64-encoded plugin, theme, settings, content, MU-plugin or wp-content files.',
    inputSchema: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      plugins: z.array(z.union([z.string(), z.object({ slug: z.string(), activate: z.boolean().default(true) })])).max(100).optional(),
      themes: z.array(z.union([z.string(), z.object({ slug: z.string(), activate: z.boolean().default(true) })])).max(20).optional(),
      libraryPluginIds: z.array(pluginLibraryIdSchema).max(25).optional(),
      files: z.array(z.object({
        name: z.string().min(1).max(180),
        kind: z.enum(['plugin', 'theme', 'settings', 'content', 'mu-plugin', 'wp-content']),
        destination: z.string().max(300).optional(),
        content: z.string().min(1).max(35_000_000).describe('Base64-encoded file contents.'),
      })).max(25).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (input) => api.createBlueprint(input));

  register(server, 'update_blueprint', {
    title: 'Update blueprint',
    description: 'Edit an existing WordPress blueprint, including metadata, catalog packages, retained files, new uploads and any mix of plugins from the local plugin library.',
    inputSchema: z.object({
      blueprintId: blueprintIdSchema,
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      plugins: z.array(z.union([z.string(), z.object({ slug: z.string(), activate: z.boolean().default(true) })])).max(100).optional(),
      themes: z.array(z.union([z.string(), z.object({ slug: z.string(), activate: z.boolean().default(true) })])).max(20).optional(),
      retainedFileIds: z.array(z.string().min(1)).max(25).optional(),
      libraryPluginIds: z.array(pluginLibraryIdSchema).max(25).optional(),
      files: z.array(z.object({
        name: z.string().min(1).max(180),
        kind: z.enum(['plugin', 'theme', 'settings', 'content', 'mu-plugin', 'wp-content']),
        destination: z.string().max(300).optional(),
        content: z.string().min(1).max(35_000_000).describe('Base64-encoded file contents.'),
      })).max(25).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ blueprintId, ...input }) => api.updateBlueprint(blueprintId, input));

  register(server, 'download_wordpress_plugins', {
    title: 'Download WordPress.org plugins',
    description: 'Download one or more current official plugin ZIPs into the reusable local plugin library, optionally adding the same plugins to an existing blueprint.',
    inputSchema: z.object({
      slugs: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,190}$/)).min(1).max(24),
      blueprintId: blueprintIdSchema.optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (input) => api.downloadWordPressPlugins(input));

  register(server, 'download_wordpress_plugin_to_blueprint', {
    title: 'Download WordPress.org plugin to blueprint',
    description: 'Download the current official plugin ZIP from WordPress.org and store it in an existing blueprint. Repeating the call updates the stored ZIP.',
    inputSchema: z.object({
      blueprintId: blueprintIdSchema,
      slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,190}$/).describe('WordPress.org plugin slug returned by search_wordpress_plugins.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, ({ blueprintId, slug }) => api.downloadWordPressPluginToBlueprint(blueprintId, slug));

  register(server, 'delete_blueprint', {
    title: 'Delete blueprint',
    description: 'Delete an unused WordPress blueprint and its stored files.',
    inputSchema: z.object({ blueprintId: blueprintIdSchema }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ blueprintId }) => api.deleteBlueprint(blueprintId));

  register(server, 'list_agents', {
    title: 'List MCP agents',
    description: 'List MCP clients that connected to this control plane, including connection status, IP address, client identity and request telemetry.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.listMcpAgents());

  register(server, 'manage_agent', {
    title: 'Manage MCP agent',
    description: 'Restart server-side connection tracking, remove or restore MCP access for a client fingerprint, or forget a removed telemetry record.',
    inputSchema: z.object({
      agentId: agentIdSchema,
      action: z.enum(['restart', 'remove', 'restore', 'forget']),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ agentId, action }) => api.manageMcpAgent(agentId, action));

  register(server, 'get_lovable_connection', {
    title: 'Get Lovable connection',
    description: 'Read Lovable authorization, account and workspace status.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, () => api.getLovableConnection());

  register(server, 'start_lovable_connection', {
    title: 'Start Lovable connection',
    description: 'Start Lovable OAuth and return the authorization URL that a person must open.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, () => api.startLovableConnection());

  register(server, 'disconnect_lovable', {
    title: 'Disconnect Lovable',
    description: 'Revoke and remove the connected Lovable authorization.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, () => api.disconnectLovable());

  register(server, 'create_lovable_project', {
    title: 'Create Lovable project',
    description: 'Create a real project through the connected Lovable account.',
    inputSchema: z.object({ initialMessage: z.string().min(1).max(100_000), workspaceId: z.string().max(200).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => api.createLovableProject(input));

  return server;
}

export function createControlPlaneMcpHandler(api) {
  return createMcpHandler(() => createControlPlaneMcpServer(api), {
    legacy: 'stateless',
    responseMode: 'json',
    onerror: (error) => console.error('MCP request failed:', error.message),
  });
}
