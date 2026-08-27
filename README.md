# GeekHeros control plane

GeekHeros is a local WordPress and Lovable application control plane backed by Docker Desktop. The dashboard reads real container state and sends lifecycle operations through a loopback-only agent.

## Start it

Requirements: Node.js 22.13 or newer and Docker Desktop using Linux containers.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

`npm run dev` starts both the web interface and Docker agent. They share a random one-time token; the agent listens only on `127.0.0.1:8788`.

## WordPress launches

- A dedicated WordPress application container.
- An isolated MariaDB companion container.
- Separate named volumes for WordPress files and database data.
- A private per-site Docker network.
- A Traefik hostname route on the shared `geekheros-edge` network.
- A random loopback port for direct diagnostics.

## Lovable launches

Lovable's Build with URL API opens the prefilled generation flow in your signed-in Lovable account. Because the API does not return source artifacts, connect the finished Lovable project to GitHub or GitLab and paste that repository into GeekHeros.

GeekHeros then:

- Clones the selected branch without placing repository credentials in the remote URL.
- Builds the standard Lovable Vite application in a controlled Node.js 22 image.
- Serves the generated `dist/` bundle from Nginx with React Router fallback support.
- Creates the same isolated Docker network, Traefik hostname route, resource limits and loopback preview used by WordPress sites.
- Checks for remote commits, archives source recovery points and rebuilds the application on demand.

Private repositories can use an optional access token stored only in the ignored local `.geekheros/state.json` file. Optional frontend build variables must start with `VITE_`; they are compiled into the browser bundle and must not contain server secrets.

For immediate local testing, use a hostname such as `client.localhost`. For a public hostname, point its A record to the Docker host and forward ports 80 and 443 through the host firewall/router.

## Working operations

- Launch, start, stop, restart and permanently delete WordPress or Lovable sites.
- Create client records, assign sites to clients and organize sites with persistent tags.
- Read live Docker, WordPress, PHP, plugin and theme versions.
- Back up the MariaDB database and WordPress volume.
- Update WordPress core, individual or all plugins, and individual or all themes after creating a backup.
- Activate and deactivate plugins and switch installed themes through WP-CLI.
- Verify WordPress core and plugin checksums.
- Open WP Admin using a 60-second, single-use login capability without exposing the administrator password.
- Route domains to the correct container through Traefik.
- Record completed and failed operations in the local activity log.
- Open a prefilled Lovable build, deploy its Git-synced source, check for new commits and rebuild its container.

## One-click WP Admin

Every managed site receives `wp-content/mu-plugins/geekheros-control-plane.php`. The control plane stores only a hash-backed, expiring WordPress transient, then posts the one-time capability to WordPress. The MU-plugin consumes the capability before setting a browser-session authentication cookie, so the same capability cannot be replayed. It cannot be deactivated from WordPress, and its must-use plugin table is hidden from client administrators.

Local state, Lovable source checkouts and backups live under `.geekheros/` and are excluded from source control. Deleting a site from the UI with data removal enabled deletes its containers, applicable named volumes, built image, source checkout and backup directory.

## Hosted dashboard limitation

The private hosted Sites build can show the interface, but it cannot reach Docker Desktop on this computer without a secure tunnel. Use the local URL for container control. A tunnel-backed remote node can be added later without changing the Docker agent API.
