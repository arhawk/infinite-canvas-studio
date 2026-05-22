# Mind Map Infinite Canvas

A vanilla JavaScript infinite-canvas board built on Konva.js with a lightweight Vite setup. The current app combines canvas-native nodes, DOM-overlay components, catalog-driven outline data, presentation navigation, local undo/redo history, and document export/import in an extension-friendly architecture.

For internal architecture, extension conventions, and implementation details, see [AGENTS.md](AGENTS.md).

## Highlights

- Infinite canvas pan and zoom with stage-aware coordinate conversion
- Palette components for `Page`, `Button`, `Text`, `Sticky Note`, `Image`, `Iframe`, `Ranking Box`, `JS Code Runner`, and `Local Video`
- Multi-select, Shift marquee selection, copy/paste, and clipboard image paste
- Pen, Pencil, Highlighter, and whole-stroke Eraser tools
- Container capture/release and curved component-to-component connections
- Catalog outline panel with branch collapse and visibility syncing
- Attachments on attachment-aware components such as `Page` and legacy `Container`
- Presentation navigation through pages, buttons, and connection edge jump buttons
- Online room sharing with optional host passwords, QR links, and viewer/host camera following
- Local undo/redo, JSON save/load, and single-file HTML export
- Teaching utilities including minimap, page compare, binary calculator, timer, and center-map controls

## Stack

- pnpm
- Vite
- Vanilla JavaScript
- Konva.js
- Lucide Icons
- Vitest
- Playwright

## Development

```bash
pnpm install
pnpm dev
pnpm run server
```

Run `pnpm dev` and `pnpm run server` in separate terminals during local sharing/collab development.

The Vite dev server runs on `http://localhost:3000`.
The room relay server runs with `pnpm run server`. A root-level `pnpm install` is sufficient for both frontend and relay dependencies.
When the frontend is opened from `localhost`, `127.0.0.1`, or `::1`, room requests go through the Vite `/api` and `/ws` proxy to the local server. Other hosts use `au.baitian.moe:3001`; tests can override this with `window.__ROOM_BACKEND_HOST__`.

Runtime HTML export uses the generated `dist/__export-template` file as the template source.

## Build And Verification

```bash
pnpm build
pnpm preview
pnpm test:unit
pnpm test:e2e
pnpm test
```

`pnpm build` keeps the normal Vite output for development hosting and deployment, then refreshes the runtime HTML export template:

- `dist/index.html`
- `dist/assets/*`
- `dist/__export-template`

`dist/__export-template` is generated during `pnpm build`, and runtime HTML export loads the template from `/__export-template`. Users create a self-contained HTML document from the app's save/export menu.

On a new machine, install the Playwright browser once before the first E2E run:

```bash
pnpm exec playwright install chromium
```

## Feature Overview

- Primary app modes: `edit` and `presentation`
- Editor tools: `arrange`, `pen`, `pencil`, `highlighter`, and `eraser`
- Hidden/internal component types include `catalog` and `connection`
- Local undo/redo supports add, delete, move, transform, editor changes, attachment changes, connection edits, focus attribute updates, completed brush strokes, and erased strokes
- Local save/load exports and imports full JSON board snapshots including nodes, drawings, catalog data, saved focus attributes, attachment metadata, and viewport state
- Single-file export embeds a normalized document snapshot into the exported HTML so it can reopen itself offline
- Share creates a four-digit `/room/1234` link. The share popover disables the create button while the request is pending, then shows a QR code with the link underneath and hides the password input/create button.
- Room viewers cannot enter edit mode or load documents. They can download JSON/HTML from the existing save menu, switch between free viewer camera and host-follow camera, and automatically leave host-follow mode if they pan or zoom.
- Local `file://` HTML exports hide the Share button because they cannot reliably use the hosted room backend from a local file context.

## Testing

Current automated coverage includes:

- Core unit tests for registries, keybindings, mode management, component serialization, runtime HTML export, catalog helpers, and branch visibility
- Component unit tests for `iframe` and `javascriptEditor`
- Playwright smoke tests for mode switching, add/delete flow, undo/redo add flow, brush undo/redo, and whole-stroke erase undo/redo
- Playwright feature tests for connections, focus navigation, component editor changes, document roundtrip load, button-driven navigation, and undo/redo of node movement
- Playwright room tests for create-room feedback, password-protected sharing, QR/link layout, viewer camera modes, room readiness, and unauthorized WebSocket messages

The E2E harness uses `window.__APP_TEST_API__` for canvas-heavy flows instead of relying on fragile pixel math. Current helpers include:

- node lookup and summaries
- viewport control
- node movement
- connection creation
- focus saving
- document export / load
- history reset / undo / redo
- component editor opening

## Offline Constraints

The app targets offline-safe typography by default:

- The project no longer depends on Google Fonts at runtime
- Normal builds and single-file exports both use local/system font stacks only
- Exported single-file HTML embeds its current document snapshot for offline reopening

Current limitation:

- Offline support currently favors local availability over exact font matching, so the app no longer renders with the original `IBM Plex Sans` / `Space Grotesk` web fonts
- Browser security policies can still limit embedded web pages inside `Iframe` components

## Project Structure

- `index.html`: application shell and toolbar layout
- `src/main.js`: app bootstrap, component registration, plugin mounting, starter data, and E2E hook-up
- `src/styles.css`: global styling and responsive layout
- `src/core/`: app infrastructure, mode management, registries, and base classes
- `src/document/`: document schema, import/export helpers, and runtime HTML export support
- `src/online/`: room route helpers plus host/viewer WebSocket clients
- `src/component/`: component definitions for page, button, text, sticky, image, iframe, video, ranking box, JavaScript editor, catalog, connection, and legacy container
- `src/plugins/`: selection, drawing, toolbar, catalog, connections, focus, attachments/bookmarks, history, document, minimap, page compare, timer, calculator, and related UI behavior
- `src/component/LeftToolbar/` + `src/component/ComponentsDropdown/`: primary add-component entry UI (left toolbar trigger + components dropdown)
- `server/`: stateless Node.js room relay for HTTP room creation and WebSocket message forwarding
- `src/testApi.js`: browser-only helpers used by Playwright
- `tests/unit/`: Vitest coverage for core logic and selected extension modules
- `tests/e2e/`: Playwright smoke and feature coverage
- `pr-guide.md`: contributor guide for branching, PRs, and conflict resolution
