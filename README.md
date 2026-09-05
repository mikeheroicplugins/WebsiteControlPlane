# geekheros.com control plane

GeekHeros manages WordPress and Lovable sites on a development workstation or a standalone Linux VPS. Standard Docker Engine provides site isolation; Docker Desktop is optional for local Windows/macOS development and is not required in production.

## VPS deployment

See [the deployment and migration guide](docs/VPS.md). `npm run build:vps` builds the standalone dashboard; `npm run start:vps` runs the supervised management agent and same-origin gateway. The supplied systemd and Caddy configuration adds boot-time startup, HTTPS administrator sign-in, private management ports and remote MCP access. Persistent state lives outside the source checkout. The existing Sites build remains available through `npm run build`.

## Start it

Requirements: Node.js 22.13 or newer and a reachable Linux Docker Engine (Desktop is optional on Windows/macOS).

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

`npm run dev` starts the web interface and local management agent. They share a random one-time token; the agent listens only on `127.0.0.1:8788`. Use the VPS service instead for unattended production hosting.

## WordPress launches

- A dedicated WordPress application container.
- An isolated MariaDB companion container.
- Separate named volumes for WordPress files and database data.
- A private per-site Docker network.
- A Traefik hostname route on the shared `geekheros-edge` network.
- A random loopback port for direct diagnostics.
- An optional reusable blueprint applied before the site becomes available.

## WordPress blueprints

Blueprints are stored under the ignored local `.geekheros/` directory. A blueprint can include WordPress.org plugin or theme slugs, uploaded plugin/theme ZIPs, a WordPress export XML file, must-use plugin PHP, and arbitrary files placed under `wp-content/`. Existing blueprints can be edited at any time to change their metadata or mix of catalog packages, downloaded plugins and uploaded files.

The Blueprints page can search the live WordPress.org plugin repository and download one or more official plugin ZIPs into a reusable local plugin library without assigning them to a blueprint. A download can also be added to a selected blueprint immediately, and any combination of library plugins can be selected later from the blueprint editor. Repository downloads are restricted to `downloads.wordpress.org`, validated as ZIP archives, hashed, and stored with source/version metadata so the same plugin can be refreshed later.

Settings JSON supports four top-level fields: `options`, `plugins`, `themes`, and `pages`. Download the example from the Add blueprint modal for a working schema. Uploaded files are size-limited, validated for their selected purpose, hashed for integrity, and copied only into the new WordPress volume. The launch modal defaults to `Default — Clean WordPress install`; selecting a blueprint applies it after WordPress core installation and before the site is marked ready.

## Lovable launches

Connect Lovable from Settings using its OAuth-protected MCP service. The local GeekHeros agent stores the resulting token only in the ignored local state file and reads the authorized account and workspaces. A one-click launch creates the project in the selected workspace, waits for generation, imports its files through Lovable and deploys the result without requiring Git.

GeekHeros then:

- Creates or connects to the selected Lovable project and imports its current source revision.
- Builds the application in a controlled Node.js 22 image.
- Detects modern TanStack Start output and runs its Node server, while retaining an Nginx runtime for static Vite bundles.
- Creates the same isolated Docker network, Traefik hostname route, resource limits and loopback preview used by WordPress sites.
- Checks for new Lovable revisions, archives source recovery points and rebuilds the application on demand.

Existing Git-synced Lovable sites remain supported, including private repositories with an optional access token stored only in the ignored local `.geekheros/state.json` file. Optional frontend build variables must start with `VITE_`; they are compiled into the browser bundle and must not contain server secrets.

For immediate local testing, use a hostname such as `client.localhost`. For a public hostname, point its A record to the Docker host and forward ports 80 and 443 through the host firewall/router.

## Porkbun domains

Domains is a submenu of Sites and connects to Porkbun API v3. Test and Live credentials are stored separately in the ignored local `.geekheros/state.json` file; only masked public-key identifiers are returned to the dashboard, and Test mode is the default. The page reads real balances, registered domains, expiration dates, transfer state, availability and registration/renewal/transfer pricing. Common registration, renewal, auto-renew and DNS workflows have dedicated controls.

The advanced operations console exposes 84 allowlisted Porkbun capabilities across account utilities, domains, DNS and DNSSEC, nameservers and glue, URL forwarding, transfers, SSL, Cloudflare, marketplace, hosting, email, webhooks, pricing and sandbox management. State-changing calls require an explicit confirmation, billable calls surface the selected Test/Live mode, and registration or renewal runs Porkbun preflight before the final UI confirmation. API-key request/retrieval endpoints are intentionally excluded so saved credentials cannot be read back through the dashboard or MCP.

## Working operations

- Launch, start, stop, restart and permanently delete WordPress or Lovable sites.
- Create and edit reusable WordPress blueprints, build a reusable library of official WordPress.org plugin ZIPs, mix and match library plugins and configuration files, and apply a blueprint during a new launch.
- Create client records, assign sites to clients and organize sites with persistent tags.
- Read live Docker, WordPress, PHP, plugin and theme versions.
- Back up the MariaDB database and WordPress volume on demand, or schedule automatic backups every 6 or 12 hours, daily, every 3 days, weekly, or monthly for production and staging sites.
- Review one combined production/staging backup history and restore any recovery point to either linked environment. Every restore first creates a safety backup of the destination, and cross-environment database restores rewrite site URLs automatically.
- Update WordPress core, individual or all plugins, and individual or all themes after creating a backup.
- Activate and deactivate plugins and switch installed themes through WP-CLI.
- Verify WordPress core and plugin checksums.
- Open WP Admin using a 60-second, single-use login capability without exposing the administrator password.
- Route domains to the correct container through Traefik.
- Search, register, renew and manage domains through Porkbun, including portfolio, transfer, DNS, DNSSEC, nameserver, glue, URL-forwarding, SSL, Cloudflare, webhook and advanced API controls with a Test/Live safety switch.
- Record completed and failed operations in the local activity log.
- Connect a Lovable account, create and deploy projects directly, check for new revisions and rebuild their containers.
- Track authenticated MCP agents by client identity and IP, inspect request telemetry, restart connection tracking, and remove or restore per-client access.
- Analyze real fleet and per-site availability, average and P95 response time, monitoring failures, control-plane operations, backups, updates and current health across 24-hour, 7-day, 30-day and 90-day ranges.
- Clone production WordPress sites into isolated staging containers, sync production into staging, and promote tested staging changes with automatic recovery points.

## One-click WP Admin

Every managed site receives `wp-content/mu-plugins/geekheros-control-plane.php`. The control plane stores only a hash-backed, expiring WordPress transient, then posts the one-time capability to WordPress. The MU-plugin consumes the capability before setting a browser-session authentication cookie, so the same capability cannot be replayed. It cannot be deactivated from WordPress, and its must-use plugin table is hidden from client administrators.

Local state, Lovable source checkouts and backups live under `.geekheros/` and are excluded from source control. Deleting a site from the UI with data removal enabled deletes its containers, applicable named volumes, built image, source checkout and backup directory.

## Site care and MCP parity

Managed site details include a real browser-rendered frontend capture that refreshes every 60 minutes, 10-minute uptime checks, manual and scheduled WordPress backups, safety-backed restore operations, container logs, an audited terminal and WP-CLI console, database queries, a scoped `wp-content` code editor, and runtime inspection. Microsoft Edge or Google Chrome is required on the agent machine for frontend captures.

Every dashboard capability is also part of the authenticated MCP server. `search_wordpress_plugins` searches the official repository; `download_wordpress_plugins`, `list_plugin_library` and `delete_plugin_library_item` manage reusable official ZIPs with optional blueprint assignment; and `update_blueprint` edits the complete package and file mix of an existing blueprint. The single-plugin `download_wordpress_plugin_to_blueprint` operation remains available for compatibility. WordPress staging is available through dedicated list, create and lifecycle tools, including scoped file/database sync and promotion. Backup schedules are readable and configurable through MCP, while `run_site_operation` can create an immediate production or staging backup. `get_backup_history` returns the combined recovery timeline and valid restore destinations; `restore_site_backup` restores a selected recovery point to its owning site or its linked production/staging counterpart. The Porkbun tool family reads redacted connection status, switches Test/Live mode, searches and lists domains, runs registration/renewal preflights, manages auto-renew and DNS, and exposes the same 84-operation allowlist through `call_domain_api`. The Agents page records authenticated MCP client metadata, network origin, recency, tool usage and response timing without storing authorization headers, tool arguments or prompts. The Analytics page and `get_analytics` MCP tool expose the same observed monitoring, latency, operation, backup and health aggregates, including time-range, site, environment and workload filters and granular measurements. Analytics never creates sample records or empty chart buckets; blanks mean that the requested data has not yet been observed. Feature work is incomplete until the corresponding MCP tool or MCP-accessible operation is registered and its discovery path is tested.

## Hosted dashboard connection

The private hosted dashboard connects back to the Docker agent through the browser's loopback interface. Keep `npm run dev` running on the same computer and allow the browser's Local Network Access prompt. The agent permits this bridge only from the private GeekHeros Sites origin; other browser origins remain blocked and non-browser requests still require the agent token.

A browser on another computer cannot reach this machine through loopback and requires a separately configured private tunnel.
