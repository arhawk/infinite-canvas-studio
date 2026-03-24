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

## Core Interaction Model

The app has three main interaction states:

- `presentation`
- `edit.arrange`
- `edit.brush`

Most user-facing behavior is implemented as plugins mounted on a central `App` instance. Core infrastructure lives under `src/core/`, canvas behavior is coordinated through `StageController`, and component definitions live under `src/component/`.

If you are extending the app, the most important thing to understand is that this project has three separate state layers:

- runtime canvas state: the live Konva node tree and viewport
- history state: local in-memory undo/redo entries for the current session
- document state: the JSON snapshot used for export/import

These layers are intentionally separate. `undo/redo` replays reversible mutations inside the current session, while `save/load` restores a full board snapshot and then resets the history baseline.

## Contributor Fast Path

If someone is new to this repo, this is the shortest correct mental model:

1. Components own node content.
   A component should describe how its node is created, edited, serialized, and restored.
2. Plugins own behavior.
   Selection, history, document import/export, focus, connections, and toolbar behavior all live in plugins.
3. History and documents are different layers.
   `undo/redo` is session-local mutation replay. `save/load` is full-document snapshot restore.
4. Reversible node mutations use an event contract.
   Emit `node:change:start` before the mutation and `node:changed` after it. Use `node:changing` only for live visual updates.
5. New components are not finished until they pass a roundtrip.
   If a component cannot survive undo/redo or export/import, it is not integrated yet.

When adding a new component, the minimum extension contract is:

- `createNode(payload)`
- `serializeNode(node)`
- `applySerializedData(node, data)`
- optional `editorFields()` if the component is editable

Most common integration mistake:

- The component renders correctly when first created, but does not serialize its component-specific state, so undo/redo or load restores an incomplete node.

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

Each component extends `BaseComponent`, is registered centrally in `src/main.js`, and now supports component-level serialization and restoration for both history replay and document save/load.

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

## Document Save / Load

The app now includes a local JSON document format used for manual export/import.

Current behavior:

- Export is available from the toolbar and `Mod+S`
- Import is available from the toolbar and `Mod+O`
- Documents persist component trees, connections, saved focus data, brush strokes, and viewport position / scale
- Loading a document runs through a dedicated restore transaction instead of replaying undo entries
- A loaded document becomes the new undo/redo baseline by calling `history.resetHistory()`

Implementation notes:

- Document structure is normalized in `src/document/schema.js`
- Runtime export/import lives in `src/document/serializer.js`
- Toolbar wiring, file input handling, and download/upload commands live in `DocumentPlugin`
- Images are saved inline as data URLs inside the JSON snapshot

Restore order matters:

- clear existing nodes and drawables
- restore regular nodes first
- reattach child nodes to their saved container parents
- restore connections after their endpoint nodes exist
- restore drawings
- restore viewport
- reset history baseline

This ordering is intentional:

- connections depend on already-restored endpoint ids
- history should not record import-time mutations
- selection and container capture should not react as if the user manually re-added every node

## Extending Components

If you add a new component, keep this checklist:

1. Create a `BaseComponent` subclass in `src/component/`.
2. Register it centrally in `src/main.js`.
3. Implement `createNode(payload)`.
4. Implement `serializeNode(node)` for component-specific data.
5. Implement `applySerializedData(node, data)` so undo/redo and save/load can rebuild the same state.
6. If the component has editable content, add `editorFields()`.
7. If the component introduces reversible mutations outside the editor, emit `node:change:start` before the change and `node:changed` after it.
8. Add at least one roundtrip test covering undo/redo or save/load.

Common mistake:

- If a component renders correctly at creation time but does not implement serialization hooks, it may appear to work until the first undo/redo or document import, where it restores stale or incomplete data.

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

## Current Limitations

- Undo/redo is local in-memory history only and is lost on reload
- Save/load is currently manual JSON import/export only; there is no autosave or local draft storage yet
- There is no collaboration or remote operation merge model yet
- Images are stored inline as data URLs, which keeps documents portable but can make JSON files large
- Loading a document restores board state but does not restore prior undo/redo stacks, current selection, or the current mode/tool
- Manual browser testing is still recommended for canvas-heavy edge cases beyond the current automated coverage
