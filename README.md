# Infinite Canvas Studio

Infinite Canvas Studio is a browser-based infinite-canvas mind-map and teaching board built with Vite, vanilla JavaScript, Konva.js, and an optional WebSocket relay server.

This README is the repository entry point. It covers setup, run commands, core capabilities, and the main supporting documents. Product-level workflows live in [docs/product-documentation.html](docs/product-documentation.html); architecture conventions live in [AGENTS.md](AGENTS.md).

## Repository Overview

- Infinite canvas pan, zoom, fit-all, and minimap navigation
- Edit and Present modes for board preparation and delivery
- Component palette for Page, Button, Text, Sticky Note, Image, Iframe, Ranking Box, JS Code Runner, Local Video, and Shapes
- Drawing tools, highlighter, whole-stroke eraser, and undo/redo
- Outline panel for lesson structure, with Catalog as the internal data node that powers it
- Component-to-component connections and button-based presentation jumps
- Background controls, page comparison, timer, binary calculator, emoji reactions, and attachments/bookmarks
- Local save/load as JSON, single-file HTML export, and Chromium-supported PROJ folder export
- Temporary online rooms with optional passwords, host/viewer camera modes, and room relay sharing

## Quick Start

### Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm `10.23.0` or compatible
- A modern browser for normal use
- Chromium-based browser if you want `Save as PROJ` / `Load PROJ`

### Install

From the repository root:

```bash
. ./scripts/activate-env.sh
pnpm install
```

The activation script prepares the repo-pinned pnpm version through `corepack` and exposes `pnpm` in the current shell session.

### Run Locally

Start the frontend:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

If you want local room sharing, run the relay in another terminal:

```bash
pnpm run server
```

### Build And Preview

```bash
pnpm build
pnpm preview
```

`pnpm build` produces `dist/` and refreshes `dist/__export-template`, which is required by runtime HTML export.

### Test

```bash
pnpm test:smoke
pnpm test:unit
pnpm test:e2e
pnpm test
```

`pnpm test` runs the smoke build, unit tests, and Playwright E2E tests.

## Runtime And Sharing

- `Edit` mode is for creating and organizing content.
- `Present` mode is for delivery, presentation navigation, and audience-facing viewing.
- `Host` follows the presenter camera inside a room.
- `Viewer` can pan and zoom freely; if a viewer interacts while following the host, the app switches to `Viewer` mode automatically.
- Room sharing uses a four-digit route such as `/room/1234`.
- Share links do not expose the host token or password.
- Local `file://` HTML exports hide the Share button because room sharing requires the hosted app and relay.

## Export And Storage

- JSON export is the portable snapshot format.
- Single-file HTML export embeds the board state for offline use.
- PROJ export is a Chromium-supported folder workflow, not a server database and not a zip file.
- The app has no application database and no persistent user-account system.
- Exported content is the main long-term storage path, along with any copied attachments that the browser can still access.

## Supporting Docs

- [docs/product-documentation.html](docs/product-documentation.html): end-user manual and workflow guide
- [docs/product-documentation.md](docs/product-documentation.md): source document for the product manual
- [UI.md](UI.md): UI design notes
- [components.md](components.md): component task and data-structure notes
- [AGENTS.md](AGENTS.md): internal architecture and development conventions

## Project Background

This project was originally developed as a university team project for CS61-3-USYD2026.

It is now maintained as a portfolio and deployment version for documentation, verification, and further improvements.

### Contributions

- Contributed to core infinite-canvas features
- Worked on save/load project structure
- Helped implement page and attachment-related features
- Supported presenter-audience synchronization features
- Participated in sprint planning, Jira workflow, testing, and documentation

## Live Demo

- Frontend Demo: https://ics-navy.vercel.app
- Backend Health Check: https://ics-r7hg.onrender.com/health

## Repository Layout

- `src/main.js`: application bootstrap and plugin/component registration
- `src/document/`: document schema, serialization, runtime export, and import helpers
- `src/online/`: room route and client helpers
- `src/plugins/`: behavior plugins, UI tooling, and feature modules
- `src/component/`: component classes and palette UI
- `server/src/index.js`: optional room relay server

## Troubleshooting

| Situation | Likely cause | Recovery |
| --- | --- | --- |
| `pnpm install` fails | Node or pnpm version mismatch | Confirm Node matches `package.json`, then reinstall dependencies. |
| `http://localhost:3000` does not open | Dev server is not running or the port is occupied | Stop the conflicting process or change the Vite port, then rerun `pnpm dev`. |
| Room creation fails | Relay server unavailable or network access blocked | Run `pnpm run server` locally, or confirm the hosted relay is reachable. |
| Viewer cannot join a room | Wrong room link, password, or expired relay state | Regenerate the room link, re-enter the password, or restart the relay if self-hosted. |
| Local exported HTML does not show Share | `file://` security restrictions | Use the hosted app for room sharing. |
| HTML export template unavailable | `dist/__export-template` missing or not served | Run `pnpm build` and confirm `/__export-template` is accessible. |
| `Save as PROJ` or `Load PROJ` is disabled | Browser lacks File System Access API support | Use Chromium-based browsers, or use JSON/HTML export instead. |
| PROJ export skips an attachment | The browser lost permission to read the local file or folder | Reconnect the attachment or reload the original project folder, then export again. |

