# GeekHeros control plane

GeekHeros is a local WordPress control plane backed by Docker Desktop. The dashboard reads real container state and sends lifecycle operations through a loopback-only agent.

## Start it

Requirements: Node.js 22.13 or newer and Docker Desktop using Linux containers.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

`npm run dev` starts both the web interface and Docker agent. They share a random one-time token; the agent listens only on `127.0.0.1:8788`.

## What a site launch creates

- A dedicated WordPress application container.
- An isolated MariaDB companion container.
- Separate named volumes for WordPress files and database data.
- A private per-site Docker network.
- A Traefik hostname route on the shared `geekheros-edge` network.
- A random loopback port for direct diagnostics.

For immediate local testing, use a hostname such as `client.localhost`. For a public hostname, point its A record to the Docker host and forward ports 80 and 443 through the host firewall/router.

## Working operations

- Launch, start, stop, restart and permanently delete sites.
- Read live Docker, WordPress and PHP versions.
- Back up the MariaDB database and WordPress volume.
- Update WordPress core, plugins and themes after creating a backup.
- Verify WordPress core and plugin checksums.
- Route domains to the correct container through Traefik.
- Record completed and failed operations in the local activity log.

Local state and backups live under `.geekheros/` and are excluded from source control. Deleting a site from the UI with data removal enabled deletes its containers, named volumes and backup directory.

## Hosted dashboard limitation

The private hosted Sites build can show the interface, but it cannot reach Docker Desktop on this computer without a secure tunnel. Use the local URL for container control. A tunnel-backed remote node can be added later without changing the Docker agent API.
