# Mind Map Infinite Canvas

A vanilla JavaScript mind-map board built on Konva.js with a lightweight Vite setup. The app combines an infinite canvas, draggable components, contextual editing tools, presentation focus navigation, and a local undo/redo history system in a dependency-light architecture designed for extension.

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

## Core Interaction Model

The app has three main interaction states:

- `presentation`
- `edit.arrange`
- `edit.brush`

Most user-facing behavior is implemented as plugins mounted on a central `App` instance. Core infrastructure lives under `src/core/`, canvas behavior is coordinated through `StageController`, and component definitions live under `src/component/`.

## Feature Overview

### Infinite Canvas

- Mouse wheel zooms uniformly on both axes
- Zoom is clamped between `0.1` and `5`
- Middle mouse drag pans
- Space + drag pans
- In `edit.arrange`, dragging empty canvas also pans
- In `presentation`, primary drag also pans

### Components

Available palette components:

- `Page`
- `Container`
- `Text`
- `Sticky Note`
- `Image`

Internal-only components:

- `connection`

Each component extends `BaseComponent`, is registered centrally in `src/main.js`, and now supports component-level serialization and restoration for history replay.

### Editing And Presentation

- Single-select and transformer handles are provided in `edit.arrange`
- Brush drawing is provided in `edit.brush`
- Focus views can be saved from the toolbar or context menu
- `Page` starts with a default relative saved focus
- Presentation mode surfaces directional edge buttons along connections when a saved destination focus is available

## History System

The current app includes a local, in-memory undo/redo system implemented by `HistoryPlugin`.

Tracked operations currently include:

- component add
- component delete
- component move
- component resize / transform
- component editor changes
- focus save
- focus position mode toggle
- connection control-point edits
- container capture / release reparenting
- completed brush strokes

Design notes:

- History is operation-based at the plugin level, but uses component snapshots for restoration.
- Related changes within the same event loop are batched into a single history entry.
- Undo/redo is local only and resets on full reload.
- Seed starter nodes are treated as the initial baseline rather than user-authored history.
- The toolbar exposes icon-only undo/redo buttons, and keyboard shortcuts support `Mod+Z`, `Mod+Shift+Z`, and `Mod+Y`.

## Testing

Current automated coverage includes:

- Core unit tests for registries, keybindings, mode management, and base component serialization behavior
- Playwright smoke tests for mode switching, add/delete flow, undo/redo add flow, and brush undo/redo
- Playwright feature tests for connections, focus navigation, component editor changes, and undo/redo of node movement

The E2E harness uses `window.__APP_TEST_API__` for canvas-heavy flows instead of relying on fragile pixel math. Current helpers include:

- node lookup and summaries
- viewport control
- node movement
- connection creation
- focus saving
- history reset / undo / redo
- component editor opening

## Project Structure

- `index.html`: application shell and toolbar/sidebar layout
- `src/main.js`: app bootstrap, component registration, plugin mounting, and starter data
- `src/styles.css`: global styling and responsive layout
- `src/core/`: app infrastructure and registries
- `src/component/`: component definitions
- `src/plugins/`: toolbar, selection, drawing, history, focus, connection, context-menu, and editor behavior
- `src/testApi.js`: browser-only helpers used by Playwright
- `tests/unit/`: Vitest coverage for core logic
- `tests/e2e/`: Playwright smoke and feature coverage

## Current Limitations

- Undo/redo is local in-memory history only and is lost on reload
- There is no save/load document format yet
- There is no collaboration or remote operation merge model yet
- Images are stored in runtime data URLs and are not persisted across reload without a future document format
- Saved focus views also remain in memory only until persistence is added
- Manual browser testing is still recommended for canvas-heavy edge cases beyond the current automated coverage
