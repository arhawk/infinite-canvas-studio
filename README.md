# Mind Map Infinite Canvas

A vanilla JavaScript mind-map board built on Konva.js with a lightweight Vite setup. The app combines an infinite canvas, draggable components, contextual editing tools, presentation focus navigation, and a local undo/redo history system in a dependency-light architecture designed for extension.

For internal architecture, extension conventions, and implementation details, see [AGENTS.md](/Users/baitian/Documents/assignment%20s4/CS61-3-USYD2026/AGENTS.md).

## Highlights

- Infinite canvas pan and zoom with stage-aware coordinate conversion
- Drag-and-drop component palette with `Page`, `Container`, `Text`, `Sticky Note`, and `Image`
- Single-node selection, constrained transform handles, and snap guides
- Freehand brush drawing with contextual stroke controls
- Container capture/release and curved component-to-component connections
- Saved focus views with per-node `absolute` / `relative` positioning
- Presentation navigation via connection edge buttons and component double-click
- Icon-first toolbar UI powered by Lucide, including icon-only undo/redo controls
- Local undo/redo history for add, delete, move, edit, focus, connection-shape, and brush actions
- JSON-based save/load with icon-only toolbar controls, keyboard shortcuts, and viewport restoration

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
```

The Vite dev server runs on `http://localhost:3000`.

## Build And Verification

```bash
pnpm build
pnpm preview
pnpm test:unit
pnpm test:e2e
pnpm test
```

On a new machine, install the Playwright browser once before the first E2E run:

```bash
pnpm exec playwright install chromium
```

## Feature Overview
- Three interaction states: `presentation`, `edit.arrange`, and `edit.brush`
- Palette components: `Page`, `Container`, `Text`, `Sticky Note`, and `Image`
- Internal connection nodes support component-to-component linking and presentation navigation
- Local undo/redo supports add, delete, move, transform, editor changes, focus changes, connection edits, container reparenting, and completed brush strokes
- Local save/load exports and imports full JSON board snapshots including nodes, drawings, focus state, and viewport

## Testing

Current automated coverage includes:

- Core unit tests for registries, keybindings, mode management, and base component serialization behavior
- Playwright smoke tests for mode switching, add/delete flow, undo/redo add flow, and brush undo/redo
- Playwright feature tests for connections, focus navigation, component editor changes, document roundtrip load, and undo/redo of node movement

The E2E harness uses `window.__APP_TEST_API__` for canvas-heavy flows instead of relying on fragile pixel math. Current helpers include:

- node lookup and summaries
- viewport control
- node movement
- connection creation
- focus saving
- document export / load
- history reset / undo / redo
- component editor opening

## Project Structure

- `index.html`: application shell and toolbar/sidebar layout
- `src/main.js`: app bootstrap, component registration, plugin mounting, and starter data
- `src/styles.css`: global styling and responsive layout
- `src/core/`: app infrastructure and registries
- `src/document/`: document schema normalization plus export/import helpers
- `src/component/`: component definitions
- `src/plugins/`: toolbar, selection, drawing, history, document, focus, connection, context-menu, and editor behavior
- `src/testApi.js`: browser-only helpers used by Playwright
- `tests/unit/`: Vitest coverage for core logic
- `tests/e2e/`: Playwright smoke and feature coverage
