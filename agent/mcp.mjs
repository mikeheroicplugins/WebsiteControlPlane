import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

export const controlPlaneMcpToolCount = 31;

const siteIdSchema = z.string().min(1).describe('Managed site ID returned by list_sites.');
const clientIdSchema = z.string().min(1).describe('Client ID returned by list_clients.');
const blueprintIdSchema = z.string().min(1).describe('Blueprint ID returned by list_blueprints.');
const packageNamesSchema = z.array(z.string().min(1)).max(100).optional();

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
    instructions: 'Manage the local GeekHeros Docker control plane. Read current state before changing it, and confirm intent before destructive operations.',
  });

  register(server, 'get_system_info', {
    title: 'Get system information',
    description: 'Read Docker engine, edge gateway, agent and managed-site health.',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, () => api.getSystemInfo());

  register(server, 'list_activity', {
    title: 'List activity',
    description: 'Read the control-plane audit log, optionally for one managed site.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50), siteId: z.string().min(1).optional() }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ limit, siteId }) => api.listActivity({ limit, siteId }));

  register(server, 'list_sites', {
    title: 'List sites',
    description: 'List every managed WordPress and Lovable site with live container state.',
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
      lovableProjectId: z.string().max(200).optional(),
      lovableProjectUrl: z.string().optional(),
      imageUrls: z.array(z.string().url()).max(10).optional(),
      htmlUrls: z.array(z.string().url()).max(10).optional(),
      repositoryUrl: z.string().optional(),
      repositoryBranch: z.string().max(200).optional().describe('Optional Lovable Git branch. Omit it to detect the repository default branch automatically.'),
      repositoryToken: z.string().max(500).optional(),
      buildEnvironment: z.record(z.string(), z.string()).optional().describe('Lovable frontend VITE_ variables.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (input) => api.launchSite({
    ...input,
    buildEnvironment: Object.entries(input.buildEnvironment || {}).map(([key, value]) => `${key}=${value}`).join('\n'),
  }));

  register(server, 'update_site_metadata', {
    title: 'Update site metadata',
    description: 'Assign or unassign a client and replace the site tags.',
    inputSchema: z.object({ siteId: siteIdSchema, clientId: z.string().nullable().optional(), tags: z.array(z.string()).max(20).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ siteId, ...input }) => api.updateSiteMetadata(siteId, input));

  register(server, 'get_site_inventory', {
    title: 'Get WordPress inventory',
    description: 'Read WordPress core, plugin, theme, update and backup inventory for a managed WordPress site.',
    inputSchema: z.object({ siteId: siteIdSchema }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ siteId }) => api.getSiteInventory(siteId));

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
    description: 'Create a safety recovery point, then restore files, the database, or both from an existing WordPress backup.',
    inputSchema: z.object({ siteId: siteIdSchema, backupId: z.string().uuid(), restoreScope: z.enum(['all', 'files', 'database']).default('all') }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ siteId, backupId, restoreScope }) => api.runSiteOperation(siteId, 'restore-backup', { backupId, restoreScope }));

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

  register(server, 'create_blueprint', {
    title: 'Create blueprint',
    description: 'Create a WordPress blueprint from catalog packages and base64-encoded plugin, theme, settings, content, MU-plugin or wp-content files.',
    inputSchema: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      plugins: z.array(z.union([z.string(), z.object({ slug: z.string(), activate: z.boolean().default(true) })])).max(100).optional(),
      themes: z.array(z.union([z.string(), z.object({ slug: z.string(), activate: z.boolean().default(true) })])).max(20).optional(),
      files: z.array(z.object({
        name: z.string().min(1).max(180),
        kind: z.enum(['plugin', 'theme', 'settings', 'content', 'mu-plugin', 'wp-content']),
        destination: z.string().max(300).optional(),
        content: z.string().min(1).max(35_000_000).describe('Base64-encoded file contents.'),
      })).max(25).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (input) => api.createBlueprint(input));

  register(server, 'delete_blueprint', {
    title: 'Delete blueprint',
    description: 'Delete an unused WordPress blueprint and its stored files.',
    inputSchema: z.object({ blueprintId: blueprintIdSchema }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, ({ blueprintId }) => api.deleteBlueprint(blueprintId));

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
