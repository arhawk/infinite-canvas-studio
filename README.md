# Infinite Canvas Studio

A collaborative infinite canvas mind-map application built with Vite, vanilla JavaScript, Konva.js, and a WebSocket relay server.

## Live Demo

- Frontend Demo: https://infinite-canvas-studio.vercel.app
- Backend Health Check: https://infinite-canvas-studio.onrender.com/health

## Tech Stack

- Frontend: Vite, Vanilla JavaScript, Konva.js
- Backend: Node.js, WebSocket relay
- Deployment: Vercel frontend + Render backend

# Infinite Canvas Studio

Product and system handover documentation for the Infinite Canvas Studio teaching and presentation tool.

This README is intended for the client, teaching team, markers, and future maintainers who need to run, verify, hand over, or retire the product. Internal architecture and development conventions remain in [AGENTS.md](AGENTS.md).

## Final Deliverable Links:
The document linked here contains all the deliverables that we have provided to the client.
https://docs.google.com/document/d/1vWV58lKnK8Rf_BzS93d-kscz-ddYiHIgBAhaB6lNKQM/edit?usp=sharing

## Product Overview

Infinite Canvas Studio is a browser-based infinite canvas for building non-linear teaching boards and presentation flows. A teacher can create pages, styled text, sticky notes, images, shapes, embedded web pages, code runners, local videos, ranking activities, attachments, and connections. The board can then be presented locally or shared through temporary online rooms.

Core user-facing capabilities include:

- Infinite canvas pan, zoom, fit-all, and minimap navigation
- Edit and Present modes for teacher preparation and delivery
- Component palette for Page, Button, Text, Sticky Note, Image, Iframe, Ranking Box, JS Code Runner, Local Video, and Shapes
- Text style presets for Title, Body, and Note text, plus contextual editing controls for selected content
- Shape creation and styling for rectangles, ovals/circles, rhombuses, and triangles
- Drawing tools, highlighter, whole-stroke eraser, and undo/redo
- Background controls for blank, grid, or dot canvas backgrounds, theme presets, colors, and opacity
- Right-side outline for lesson structure and branch collapse
- Component-to-component connections and button-based presentation jumps
- Page Compare, Timer, Binary Calculator, and Emoji Reactions for teaching sessions
- Online sharing through temporary room/collaboration links with optional passwords
- Local save/load/export as JSON, single-file HTML, and Chromium-supported PROJ folder export

For end-user workflows, see [docs/product-documentation.html](docs/product-documentation.html).

## Hosting System Requirements

### Required

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm `10.23.0` or compatible
- A modern Chromium, Firefox, Safari, or Edge browser for normal use
- Static web hosting for the built frontend output in `dist/`

### Recommended Browser Features

- Chromium-based browser for the best support of local folder project export/import (`Save as PROJ` / `Load PROJ`)
- WebSocket support for online room sharing
- Local file access permissions when users open local attachments or PROJ folders

### Optional Room Relay Server

Online room sharing uses a Node.js HTTP/WebSocket relay in `server/src/index.js`. The frontend can run without the relay for local editing, JSON export, and HTML export, but room links require the relay service.

The default hosted relay target for non-local deployments is:

```text
au.baitian.moe:3001
```

When the frontend runs on `localhost`, `127.0.0.1`, or `::1`, Vite proxies `/api` and `/ws` to the local relay server on port `3001`.

## Installation Instructions

From the repository root, enter the project environment first:

```bash
. ./scripts/activate-env.sh
```

This uses the Node runtime already available on the host, prepares the repo-pinned
`pnpm` version through `corepack`, and exposes `pnpm` inside the project shell.

After activation, the prompt shows a `(.venv)` prefix so you can see that the
project environment is active.

Then install dependencies:

```bash
pnpm install
```

No database setup, external dataset import, or user-account initialization is required.

For first-time Playwright E2E testing on a new machine:

```bash
pnpm exec playwright install chromium
```

### Environment Usage

To enter the project environment in a new terminal session, run:

```bash
. ./scripts/activate-env.sh
```

To leave the environment and restore your previous shell path and prompt, run:

```bash
deactivate
```

The environment is shell-local, so it does not persist across new terminal
windows or tabs. Open a new terminal and source the activation script again
whenever you want `pnpm` available in that session.

## Build And Run Instructions

### Local Development

Run the frontend:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

For local room/collaboration testing, run the relay server in a separate terminal:

```bash
pnpm run server
```

### Production Build

Build the static frontend:

```bash
pnpm build
```

The build output is generated in:

```text
dist/
```

The build also refreshes:

```text
dist/__export-template
```

The runtime HTML export feature depends on this template being served at `/__export-template` by the Vite dev/preview server or deployment.

Preview the production build locally:

```bash
pnpm preview
```

### Verification

```bash
pnpm test:smoke
pnpm test:unit
pnpm test:e2e
pnpm test
```

`pnpm test` runs the smoke build, Vitest unit tests, and Playwright E2E tests.

## Optional Room Relay Server Setup

Run the relay:

```bash
pnpm run server
```

Expected local relay port:

```text
3001
```

Room sharing behavior:

- In Present mode, Share creates a room link for viewers.
- In Edit mode, Share creates a collaboration link.
- A room/collaboration may use an optional password.
- Share links use a four-digit route such as `/room/1234?session=room`.
- Viewers can follow the host camera or switch to their own viewer camera.
- Online viewer permissions are restricted compared with the teacher host.

## Editing And Presentation Features

The main editing surface combines canvas-level tools and contextual controls:

- The left toolbar opens component, pen, shape, text style, background, undo/redo, and center-map controls.
- Text style presets apply to new Text components and to a selected Text component in Edit mode. The current presets are **Title**, **Body**, and **Note**.
- Shape tools create rectangles, ovals/circles, rhombuses, and triangles. Selected shapes expose controls for type, text size, text color, fill color, opacity, border color, border width, layer order, and connection creation.
- Background controls change the canvas theme, background pattern, color, and opacity.
- Contextual toolbars appear for supported selected content such as pages, buttons, sticky notes, images, videos, text, shapes, JavaScript editor nodes, and connections.
- Present mode keeps delivery tools available for page comparison, timer/stopwatch, binary calculator, emoji reactions, drawing visibility, minimap, and camera/navigation behavior.

## Configuration And External Services

### Environment And Build Configuration

- Vite configuration: [vite.config.js](vite.config.js)
- Test configuration: [vitest.config.js](vitest.config.js), [playwright.config.js](playwright.config.js)
- Cloudflare assets example: [wrangler.jsonc](wrangler.jsonc)
- Room relay code: [server/src/index.js](server/src/index.js)

### External Dataset Connections

Not applicable. The product does not require a school database, external dataset, or preloaded data connection.

Users may optionally add:

- Iframe URLs
- Web links as attachments/bookmarks
- Local files and folders through browser-supported file APIs
- Images and videos embedded into exported documents

These are user-provided resources, not system-level dataset connections.

## User Account Creation

Not applicable.

Infinite Canvas Studio does not include a persistent user account system. Room sharing uses temporary room IDs, optional passwords, and short-lived host/viewer sessions rather than registered accounts.

## Data Storage Model

Infinite Canvas Studio has no application database.

The primary data formats are:

- **Runtime state**: current browser session state in memory
- **JSON export**: editable board snapshot for backup and later restore
- **Single-file HTML export**: browser-openable offline snapshot with the board state embedded
- **PROJ folder export**: Chromium-supported local project folder containing the board snapshot, an offline HTML entry file, and copied local attachments when browser permissions allow it
- **Temporary room state**: relay-held online state for active room/collaboration sessions

Because there is no central database, long-term user data retention depends on exported JSON, HTML, or PROJ files.

PROJ export is a local folder workflow, not a server-side project database and not a zip file generated by the app. In supported Chromium-based browsers, `Save as PROJ` asks the user to choose a writable directory, then creates a timestamped project folder with this structure:

```text
<project-folder>/
  index.html
  project.json
  attachments/
    copied-local-attachment-files
```

`project.json` is the editable document snapshot. `index.html` is an offline HTML entry file built from the same snapshot. The `attachments/` folder stores local-file attachments that the browser can still read at export time; attachments with missing or denied file handles may be skipped with a warning.

## Error Situations And Recovery

| Situation / message | Likely cause | Recovery |
| --- | --- | --- |
| `pnpm install` fails | Node or pnpm version mismatch | Confirm Node meets the version in `package.json`, then reinstall dependencies. |
| `http://localhost:3000` does not open | Vite dev server is not running or port `3000` is occupied | Stop the conflicting process or change the Vite port, then rerun `pnpm dev`. |
| Room creation fails | Relay server unavailable, network failure, or backend host unreachable | For local testing run `pnpm run server`; for deployment confirm the relay host and WebSocket access. |
| Viewer cannot join room | Wrong room link/password, expired server state, or relay connection failure | Regenerate the room link, re-enter the password, or restart the relay if self-hosted. |
| Local exported HTML does not show Share | Browser `file://` security restrictions | Use the hosted app for room sharing. Local HTML is intended for offline viewing/editing. |
| HTML export template unavailable | `dist/__export-template` missing or not served | Run `pnpm build` and confirm `/__export-template` is accessible. |
| `Save as PROJ` or `Load PROJ` disabled | Browser lacks File System Access API support | Use Chromium-based browsers, or use JSON/HTML export instead. |
| PROJ export skips an attachment | The browser no longer has permission to read that local file or folder | Reconnect the attachment or reload the original project/folder, then export again. |
| Iframe shows loading/error or remains blank | Target website blocks embedding with browser security headers | Use a link/attachment instead of embedding the site. |
| JSON/HTML import fails | Invalid file, incompatible snapshot, or corrupted export | Re-export from a known working board or restore from a previous backup file. |
| Local attachment cannot reopen | Browser file permission was revoked or the folder handle is missing | Reconnect the folder/file or use a PROJ export where supported. |

## Backup And Restore

Recommended backup routine:

1. Save an editable JSON snapshot after major editing sessions.
2. Export a single-file HTML copy for offline delivery or submission.
3. Use PROJ export when local attachments need to stay organized with the board.
4. Store final deliverables in the agreed client-accessible folder.

Restore options:

- Use **Load HTML/JSON** to restore a JSON or exported HTML snapshot.
- Use **Load PROJ** in a Chromium-based browser to restore a PROJ folder and rebind copied attachment files.
- Open an exported single-file HTML directly in a browser for offline use.

There is no database backup/restore procedure because the product does not use a database.

## End Of Life / Removal Of User

There is no user account removal workflow because Infinite Canvas Studio has no persistent account system.

For project end-of-life or removal:

- Remove deployed static files from the hosting provider.
- Stop the optional room relay server.
- Delete or archive exported JSON, HTML, and PROJ files according to the client retention decision.
- Remove shared deliverable links when they are no longer needed.
- Remove local browser permissions for files/folders if local attachments were used.

## Maintainer Notes

Development and architecture details are intentionally kept outside this README:

- Architecture and extension conventions: [AGENTS.md](AGENTS.md)
- Component implementation notes: [components.md](components.md)
- UI notes: [UI.md](UI.md)
