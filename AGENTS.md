# Commit Convention
https://www.conventionalcommits.org/en/v1.0.0/

# Mind Map Infinite Canvas

## Overview

This repository contains a mind map infinite canvas application built with pnpm, Vite, vanilla JavaScript, and Konva.js.

The app now uses a class-based architecture centered on an `App` object, a `ModeManager`, a `StageController`, and a small set of base classes for plugins, tools, commands, context menu items, and components.

The app includes:

- Infinite canvas pan and zoom
- Drag-and-drop component palette
- Editable text and sticky notes
- Single-select and transform
- Freehand brush drawing and whole-stroke erasing
- Local undo/redo history with icon-only toolbar controls and keyboard shortcuts
- Local JSON save/load with icon-only toolbar controls, keyboard shortcuts, and viewport restoration
- Container system with parent-child grouping and arbitrary component-to-component connections
- Per-component saved focus views for presentation jumps
- Persistent mode toggle (Edit/View) with animated UI transitions
- Icon-based tool interface using Lucide Icons
- Class-based extension points for secondary development

## First Read This

If you only read one section before editing the project, read this one.

The shortest correct mental model is:

1. Components own content.
   A component is responsible for how its node is created, what data it stores, and how that data is serialized/restored.
2. Plugins own behavior.
   Selection, history, document import/export, connections, focus navigation, context menus, and toolbar interactions live in plugins.
3. History and documents are different state layers.
   `HistoryPlugin` replays reversible session-local mutations. `DocumentPlugin` restores a full JSON snapshot and then resets the history baseline.
4. Reversible mutations use events, not direct coupling.
   Emit `node:change:start` before a reversible node mutation and `node:changed` after it. Use `node:changing` only for live visual sync.
5. A new component is not complete until it survives a roundtrip.
   If it cannot survive undo/redo and save/load, it is not integrated yet.

New component checklist:

- add the component class under `src/component/`
- register it in `src/main.js`
- implement `createNode(payload)`
- implement `serializeNode(node)`
- implement `applySerializedData(node, data)`
- add `editorFields()` if the content is user-editable
- emit mutation events for any reversible edits outside the component editor
- add at least one roundtrip test through undo/redo or document load

Most common failure mode:

- the component looks correct when first created, but it does not serialize its own content, so undo/redo or import restores a stale node

## Tech Stack

- Package manager: pnpm
- Dev/build tool: Vite
- Frontend: Vanilla JavaScript
- Canvas library: Konva.js
- Icon library: Lucide Icons
- Styling: Plain CSS

## Run Commands

- Install dependencies: `pnpm install`
- Start local dev server: `pnpm dev`
- Build static output: `pnpm build`
- Export a single self-contained HTML file: `pnpm export:html`
- Preview production build: `pnpm preview`
- Run unit tests: `pnpm test:unit`
- Run E2E smoke tests: `pnpm test:e2e`
- Run full local verification: `pnpm test`
- First-time Playwright browser install on a new machine: `pnpm exec playwright install chromium`

The Vite dev server is configured in [vite.config.js](vite.config.js) and runs at `http://localhost:3000`.

## Project Structure

### Static Files

- [index.html](index.html): Main application shell
- [src/styles.css](src/styles.css): Global layout and visual styling
- [vite.config.js](vite.config.js): Vite dev and preview server configuration
- [vitest.config.js](vitest.config.js): Vitest unit-test configuration
- [playwright.config.js](playwright.config.js): Playwright E2E configuration with local Vite web server

### Entry Point

- [src/main.js](src/main.js): App bootstrap — creates `App`, registers built-in components, registers built-in plugins, starts the app, seeds starter nodes, resets local history baseline, and exposes a test API in E2E mode
- [src/testApi.js](src/testApi.js): Test-only browser API for Playwright, including canvas coordinate helpers, node lookup helpers, board reset utilities, history helpers, document helpers, and editor-opening helpers

### Document Layer (`src/document/`)

- [src/document/schema.js](src/document/schema.js): Versioned JSON document schema normalization, defaults, and validation helpers
- [src/document/serializer.js](src/document/serializer.js): Runtime document export/import helpers for nodes, drawings, viewport state, and layer reset / restore

### Core Infrastructure (`src/core/`)

- [src/core/app.js](src/core/app.js): `App` class with lifecycle, stage wiring, registries, plugin mounting, and public API
- [src/core/baseClasses.js](src/core/baseClasses.js): Core extension base classes: `BasePlugin`, `BaseTool`, `BaseCommand`, `BaseContextMenuItem`, `BaseComponent`
- [src/core/modeManager.js](src/core/modeManager.js): Central mode state machine for `presentation`, `edit.arrange`, and `edit.brush`
- [src/core/eventBus.js](src/core/eventBus.js): `EventBus` class for decoupled app events
- [src/core/commandRegistry.js](src/core/commandRegistry.js): `CommandRegistry` for class-based commands
- [src/core/toolRegistry.js](src/core/toolRegistry.js): `ToolRegistry` for class-based tools
- [src/core/keybindingRegistry.js](src/core/keybindingRegistry.js): `KeybindingRegistry` for keyboard shortcuts
- [src/core/contextMenuRegistry.js](src/core/contextMenuRegistry.js): `ContextMenuRegistry` for class-based right-click items
- [src/core/componentRegistry.js](src/core/componentRegistry.js): `ComponentRegistry` for class-based components

### Shared Dependencies (`src/lib/`)

- [src/lib/konva.js](src/lib/konva.js): Central Konva module entry used across components and plugins
- [src/lib/icons.js](src/lib/icons.js): Lucide icon registry and scoped DOM icon rendering helper

### Plugins (`src/plugins/`)

- [src/plugins/toolbar.js](src/plugins/toolbar.js): Toolbar UI plugin with icon-based tool buttons, icon-only undo/redo controls, persistent mode toggle, and contextual per-tool control groups for connection, focus, and brush settings
- [src/plugins/sidebar.js](src/plugins/sidebar.js): Component palette plugin with drag/drop and image upload using Lucide placeholders
- [src/plugins/selection.js](src/plugins/selection.js): Selection plugin with arrange tool, single-node transformer, snap guides, delete command, and mode-based interactivity management
- [src/plugins/drawing.js](src/plugins/drawing.js): Drawing plugin with brush and eraser tools
- [src/plugins/history.js](src/plugins/history.js): Local history plugin with batched undo/redo entries, node snapshot restoration, drawing replay, toolbar button wiring, and keyboard shortcuts
- [src/plugins/document.js](src/plugins/document.js): Local document plugin with JSON export/import commands, file input handling, status toasts, and restore transactions that reset the history baseline
- [src/plugins/componentEditor.js](src/plugins/componentEditor.js): Modal component editor plugin with class-driven field definitions, double-click open, Enter shortcut, and Apply/Cancel actions
- [src/plugins/containers.js](src/plugins/containers.js): Container system plugin with capture/release logic
- [src/plugins/connections.js](src/plugins/connections.js): Generic connection plugin with component-to-component linking, selectable curved connectors, and control handles
- [src/plugins/focusNavigation.js](src/plugins/focusNavigation.js): Focus and presentation navigation plugin with per-component saved camera views, per-component absolute/relative focus mode state, bidirectional edge jump buttons, toolbar/context-menu `Save Focus`, and presentation double-click navigation
- [src/plugins/contextMenu.js](src/plugins/contextMenu.js): Canvas context menu plugin rendering Konva-based menus

### Tests (`tests/`)

- [tests/unit/core/](tests/unit/core/): Vitest unit tests for core infrastructure such as `EventBus`, `CommandRegistry`, `KeybindingRegistry`, `ModeManager`, and base classes
- [tests/unit/document/](tests/unit/document/): Vitest coverage for document schema normalization and validation
- [tests/e2e/smoke.spec.js](tests/e2e/smoke.spec.js): Playwright smoke coverage for boot, mode toggle, palette add/delete flow, undo/redo add flow, brush drawing undo/redo, and whole-stroke erase undo/redo
- [tests/e2e/features.spec.js](tests/e2e/features.spec.js): Playwright feature coverage for connection creation/update, toolbar `Save Focus`, presentation navigation buttons, component editor editing, document roundtrip load, and undo/redo of node movement

## Testing

The repository now has a local automated testing baseline:

- Unit tests use `Vitest` with `jsdom`
- Browser smoke and feature tests use `Playwright`
- `pnpm test` runs build + unit tests + all Playwright E2E coverage
- `playwright.config.js` starts the Vite dev server with `VITE_E2E=1`, which enables the browser-side test helpers in `src/testApi.js`
- `src/testApi.js` now includes helpers for viewport control, node movement, connection creation, focus saving, component editor opening, document export/load, history reset, and undo/redo activation

Testability conventions:

- Stable DOM controls used by E2E should keep `data-testid` attributes
- Canvas-heavy E2E flows should prefer helpers from `window.__APP_TEST_API__` instead of hard-coded pixel math in tests
- For new pure logic, prefer extracting helper functions so they can be covered by Vitest instead of only browser tests
- For new interaction-heavy features, add or extend Playwright smoke coverage

### Stage

- [src/stage.js](src/stage.js): `StageController` class for pan, zoom, grid rendering, coordinate conversion, viewport helpers, and animated camera restore with optional scale

### Component Definitions (`src/component/`)

- [src/component/editableText.js](src/component/editableText.js): `EditableTextBehavior` for inline text editing
- [src/component/text.js](src/component/text.js): `TextComponent`
- [src/component/sticky.js](src/component/sticky.js): `StickyComponent`
- [src/component/image.js](src/component/image.js): `ImageComponent`
- [src/component/page.js](src/component/page.js): `PageComponent`
- [src/component/connection.js](src/component/connection.js): `ConnectionComponent`
- [src/component/container.js](src/component/container.js): `ContainerComponent` for grouping nodes

## Architecture

### Class-Based Extension System

All extensions are classes.

- Plugins extend `BasePlugin`
- Tools extend `BaseTool`
- Commands extend `BaseCommand`
- Context menu items extend `BaseContextMenuItem`
- Components extend `BaseComponent`

The app mounts plugin classes with:

```js
const app = new App({ container });
app.use(MyPlugin, options);
app.start();
```

Inside a plugin, secondary developers usually only need to override:

- `tools()`
- `commands()`
- `menuItems()`
- `onSetup()`
- `onModeEnter()`
- `onModeExit()`
- `onModeChange()`

The base class handles registration, cleanup, and mode lifecycle wiring.

Project convention:

- All component classes are instantiated and registered centrally in `src/main.js`
- Plugins own behavior, UI, commands, tools, menu items, and mode reactions
- Do not register components from plugins in normal project development

### State Layering

This codebase has three different kinds of board state:

- Runtime state: the live Konva node tree plus the current viewport
- History state: local in-memory undo/redo entries managed by `HistoryPlugin`
- Document state: a JSON snapshot used by `DocumentPlugin` for export/import

They are related, but they are not interchangeable.

- Runtime state is what the user is currently editing.
- History state is a reversible mutation log for the current browser session.
- Document state is a portable snapshot format that restores the board, then becomes a new history baseline.

This separation is deliberate:

- `undo/redo` should replay reversible edits inside one session
- `save/load` should restore a whole board without restoring stale `past/future` stacks
- future collaboration can build on top of the same document/component contracts without depending on local history internals

### Mode System

The entire app is organized around these interaction states:

- `presentation`
- `edit.arrange`
- `edit.brush`
- `edit.eraser`

Modes are managed by `ModeManager`. Each plugin, command, tool, or menu item can declare static `modes` and automatically opt into lifecycle callbacks:

```js
class MyPlugin extends BasePlugin {
  static pluginId = "my-plugin";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
      },
    },
  };
}
```

If a mode or tool branch is not declared, the feature is inactive in that state.

### Event Bus

Cross-module communication uses `app.events` and the shorthand `app.on` / `app.off`:

| Event | Payload | Source |
|-------|---------|--------|
| `tool:change` | `{ toolId }` | `ToolRegistry` |
| `selection:change` | `{ nodes }` | selection plugin |
| `node:change:start` | `{ node }` | selection, editor, focus, connection-handle, and test helpers before tracked mutation |
| `node:changing` | `{ node }` | selection plugin during live drag / transform |
| `node:added` | `{ node }` | app.addComponent |
| `node:removed` | `{ node }` | selection plugin (delete) |
| `draw:added` | `{ node }` | drawing plugin after a completed brush stroke |
| `draw:removed` | `{ node }` | drawing plugin when the eraser deletes a whole stroke |
| `document:exported` | `{ document }` | document plugin after a JSON snapshot is created |
| `document:load:start` | `{ source, document }` | document plugin before clearing/restoring the board |
| `document:load:end` | `{ source, document }` | document plugin after a document restore completes |
| `document:load:error` | `{ source, error }` | document plugin when import fails |
| `zoom:change` | `{ zoom }` | `StageController` via app |
| `viewport:change` | `{ scale, viewport, size, position }` | `StageController` via app |
| `stroke:change` | `{ color, width }` | toolbar plugin |
| `mode:change` | `{ mode }` | `ModeManager` |
| `editor-tool:change` | `{ toolId }` | `ModeManager` |
| `interaction:change` | `{ mode, editorTool, activeToolId }` | `ModeManager` |

### Registries

| Registry | Access | Purpose |
|----------|--------|---------|
| `app.tools` | `ToolRegistry` | Registered tool instances |
| `app.commands` | `CommandRegistry` | Registered command instances |
| `app.keybindings` | `KeybindingRegistry` | Keyboard shortcut mapping |
| `app.contextMenu` | `ContextMenuRegistry` | Registered context menu item instances |
| `app.components` | `ComponentRegistry` | Registered component instances |

### Public API

The app object exposes:

```js
// Core objects
app.modeManager
app.stageApi
app.history
app.documentManager
app.tools
app.commands
app.keybindings
app.contextMenu
app.components

// Mode control
app.getMode()
app.setMode(mode)
app.getEditorTool()
app.setEditorTool(toolId)
app.isReadOnly()

// Events
app.on(event, handler)    // returns unsubscribe function
app.off(event, handler)

// Canvas operations
app.addComponent(type, payload)

// Lifecycle
app.use(PluginClass, options?)
app.start()
app.destroy()
```

## UI Layout

The app is split into three main regions:

- Left sidebar: draggable component palette
- Top toolbar: tools plus contextual helper controls for the active tool
- Main board: Konva infinite canvas

## Implemented Features

### 1. Infinite Canvas

Implemented in [src/stage.js](src/stage.js).

- Mouse wheel zooms the stage
- Zoom is applied uniformly on both axes
- Zoom range is clamped between `0.1` and `5`
- Middle mouse drag pans the stage
- Space plus drag also pans the stage
- In `edit.arrange`, primary drag on empty canvas also pans the viewport
- In presentation mode, primary drag also pans the viewport
- A Konva grid layer redraws with pan and zoom so the grid scales with the canvas
- `viewport:change` is emitted whenever pan/zoom/animated camera restore updates the visible canvas region

### 2. Coordinate Conversion

Implemented in [src/stage.js](src/stage.js).

Core methods on `StageController`:

```js
app.stageApi.screenToCanvas(point)
app.stageApi.canvasToScreen(point)
app.stageApi.centerOn(point, { duration, scale })
app.stageApi.getViewportBounds()
app.stageApi.getScreenSize()
```

This is used for:

- Dropping sidebar components onto the canvas
- Freehand drawing under pan and zoom
- Positioning new content in canvas coordinates
- Saving and restoring presentation focus views
- Computing whether navigation buttons should appear on a viewport edge

### 3. Sidebar Component Palette

Implemented in [src/plugins/sidebar.js](src/plugins/sidebar.js).

Available component types:

- Page
- Text
- Sticky Note
- Image
- Container

Behavior:

- Non-image components are draggable from the sidebar onto the canvas
- `Page` appears first in the palette and creates a fixed-size landscape page surface
- Image icon in the sidebar is draggable and creates a placeholder on the canvas. Double-clicking the placeholder (or any image) opens the component editor to upload or change the image file.
- Drop coordinates are converted from screen space to canvas space.
- Internal-only components such as `connection` are hidden from the palette via component metadata and are created programmatically by plugins.

### 4. Component System

Implemented in [src/core/componentRegistry.js](src/core/componentRegistry.js) with definitions in `src/component/`.

Structure:

- Each component is a class extending `BaseComponent`
- Shared inline text editing lives in [src/component/editableText.js](src/component/editableText.js)
- Components are registered as instantiated classes via `app.components.register(new MyComponent(app))`
- In this project, all component registration happens centrally in `src/main.js`

Current component classes:

- `page`
- `text`
- `sticky`
- `image`
- `container`
- `connection`

Component rules:

- `BaseComponent` assigns a unique `id`
- `BaseComponent` marks component nodes with `name: "selectable"` and `componentType`
- Components control their own Konva node creation through `createNode(payload)`
- Components now support serialization / restoration hooks used by local history replay
- Components can opt out of appearing in the sidebar by setting `static palette = false`
- Text-like components reuse `EditableTextBehavior`
- New components should be added by extending `BaseComponent`
- For new components, the key extension contract is:
  `createNode(payload)` for live creation,
  `serializeNode(node)` for component-specific persistence,
  `applySerializedData(node, data)` for undo/redo and document restore

### 5. Selection and Transform

Implemented in [src/plugins/selection.js](src/plugins/selection.js).

Supported interactions:

- Click to select a single node
- Drag a selected node to move it
- Drag on empty canvas to pan the viewport in `edit.arrange`
- Drag and transform show Konva alignment guides and snap to nearby edges or centers
- Fixed-size components such as `page` remain draggable and selectable but do not expose resize or rotation controls
- `Delete` or `Backspace` removes selected nodes (via `selection:delete` command)

Transformer rules:

- Rotation is enabled
- Scaling is ratio-locked
- Only corner anchors are enabled
- Side anchors are disabled
- Flip is disabled

This means the selected transformable node can only be scaled proportionally.

### 6. Freehand Drawing

Implemented in [src/plugins/drawing.js](src/plugins/drawing.js).

Supported tools:

- `brush`
- `eraser`

Behavior:

- Brush creates Konva lines with rounded caps and joins
- Eraser deletes a whole Konva line as soon as the pointer hits that stroke
- Drawing happens only on empty stage area
- Drawing coordinates respect current pan and zoom

### 7. Local History (Undo / Redo)

Implemented in [src/plugins/history.js](src/plugins/history.js) with support from [src/core/baseClasses.js](src/core/baseClasses.js).

Behavior:

- History entries are stored locally in memory and are reset on full reload.
- `Undo` and `Redo` are available from icon-only toolbar buttons and from keyboard shortcuts:
  `Mod+Z`, `Mod+Shift+Z`, and `Mod+Y`.
- Undo / redo now also shows a small toast describing the action that was undone or redone.
- The plugin batches related mutations that happen in the same event loop into a single history entry.
- History replay restores component nodes by calling per-component serialization / restoration hooks on `BaseComponent`.
- History currently tracks component add, delete, move, transform, editor changes, focus save, focus mode toggle, connection control-point updates, container reparenting, completed brush strokes, and erased strokes.
- Starter seed nodes are created first and then treated as the initial baseline by calling `history.resetHistory()`.

Implementation notes:

- Mutations that should be reversible emit `node:change:start` before the change and `node:changed` after the change.
- Live drag / transform interactions emit `node:changing` for real-time connection updates without creating extra history entries.
- Completed brush strokes emit `draw:added` once, after the pointer is released.
- Whole-stroke erasing emits `draw:removed` before the stroke is destroyed.
- History coverage is event-driven. If a future feature mutates node state without emitting the history events, that mutation will fall outside undo / redo.

### 8. Local Document Save / Load

Implemented in [src/plugins/document.js](src/plugins/document.js) with support from [src/document/schema.js](src/document/schema.js) and [src/document/serializer.js](src/document/serializer.js).

Behavior:

- Documents can be exported as JSON from the toolbar or with `Mod+S`.
- Documents can be imported from JSON from the toolbar or with `Mod+O`.
- Import asks for confirmation before replacing the current board when the board already contains content.
- The saved document includes component snapshots, parent-child container structure, connections, saved focus data, completed brush strokes, and current stage position / scale.
- Import runs through a dedicated restore transaction so plugins can suspend side effects such as history capture, auto-selection, container recapture, and stale editor UI.
- After a document is loaded, `history.resetHistory()` is called so the loaded state becomes the new undo / redo baseline.
- Image components serialize their inline data URL source, so exported documents remain self-contained.

Implementation notes:

- `schemaVersion` is normalized and validated in the document schema module.
- Regular nodes are restored before connection nodes so endpoint references already exist when connectors rebuild geometry.
- The current document session tracks `documentId`, `revision`, and a simple title placeholder for future expansion.

Restore transaction order:

- clear existing selectable roots and drawables
- restore regular component nodes
- reattach child nodes using `parentId`
- restore connection nodes after endpoint nodes exist
- restore draw-layer content
- restore viewport position / scale
- reset the history baseline

Why this matters:

- connections depend on already-restored endpoint ids
- history must not record import-time mutations
- selection, container recapture, and editor UI should not react as if the user manually added every restored node

Known gaps in the current implementation:

- Import is currently a full-board replace, not a partial import or merge operation.
- Restore is not yet rollback-atomic. If a restore step fails after the board has been cleared, the board can be left partially restored.
- Unknown component types are not yet treated as a hard compatibility failure; unsupported snapshots can currently be skipped during restore.
- `schemaVersion` is validated, but there is no schema migration pipeline yet.

### 9. Toolbar

Implemented in [src/plugins/toolbar.js](src/plugins/toolbar.js).

Controls:

- Persistent mode toggle (Edit/View) centered at the top
- Icon-based tool buttons (rendered from tool registry using Lucide Icons)
- Icon-only undo / redo buttons rendered with Lucide icons
- Icon-only save / load document buttons rendered with Lucide icons
- In `edit.arrange`, a helper control group appears only when a focusable node is selected
- That arrange group contains `Connect to...`, `Save Focus`, and the `Focus: Absolute / Relative` toggle for the selected component
- In `edit.brush`, a brush control group appears with the color picker and stroke width slider
- In `edit.eraser`, no extra controls are shown; dragging over a stroke deletes the whole stroke

### 10. Context Menu

Implemented in [src/plugins/contextMenu.js](src/plugins/contextMenu.js).

Behavior:

- Right-click a selectable component to see available actions
- Menu items are dynamically gathered from `app.contextMenu.getItems(target)`
- The menu is rendered as a Konva overlay on the UI layer
- In `edit.arrange`, non-connection components expose both connection actions and the `Save Focus` action supplied by feature plugins

### 11. Containers and Connections

Implemented in [src/plugins/containers.js](src/plugins/containers.js), [src/plugins/connections.js](src/plugins/connections.js), and [src/component/connection.js](src/component/connection.js).

Behavior:

- Dragging a selectable component over a container and releasing it **captures** the component as a child of the container.
- Dragging a child component out of the container bounds **releases** it back to the main layer.
- Right-click any non-connection component, or use the `Connect to...` toolbar button while it is selected in `edit.arrange`, to connect it to another component.
- Connections are real selectable nodes, so they can be selected, deleted, edited, and adjusted via visible curve control handles when selected in `edit.arrange`.
- The rendered connector uses an arrowhead, but presentation navigation treats the connection as navigable in both directions.
- Container labels are editable via double-click.

### 12. Saved Focus Views And Presentation Navigation

Implemented in [src/plugins/focusNavigation.js](src/plugins/focusNavigation.js) with support from [src/stage.js](src/stage.js).

Saved focus behavior:

- In `edit.arrange`, you can save focus either from the top toolbar or by right-clicking any non-connection component and choosing **Save Focus**.
- Every focusable component owns a `focusPositionMode` state. Regular components default to `absolute` as soon as they are created, even before any focus view is saved.
- `Page` components are created with a fixed landscape size, a default `focusPositionMode` of `relative`, and a built-in saved focus centered on the page.
- The toolbar `Focus: Absolute / Relative` toggle always reflects the currently selected component's mode and updates that component directly.
- `Save Focus` stores the current camera center and zoom on the node in a `savedFocus` attribute. Absolute focus is saved as `{ positionMode: "absolute", center: { x, y }, scale }`.
- Relative focus stores the same framing relative to the component's current anchor, shaped like `{ positionMode: "relative", offset: { x, y }, scale }`, so moving the component also moves the destination framing.
- Saving focus emits `node:changed`, shows a small success toast, and keeps dependent presentation affordances in sync without a dedicated persistence subsystem.

Presentation navigation rules:

- Navigation buttons are evaluated only in `presentation` mode.
- Double-clicking a component in `presentation` mode also jumps directly to that component's saved focus, if one exists.
- Each connection is checked in both directions:
  source visible -> target saved focus
  target visible -> source saved focus
- A direction is eligible only when the currently visible endpoint is fully inside the viewport bounds.
- A direction is eligible only when the destination endpoint has a valid `savedFocus`.
- A direction is eligible only when the saved focus center is outside the current viewport bounds.
- When eligible, the plugin samples the rendered Bezier curve, finds where that directional curve exits the viewport, and places a floating edge button slightly inside the boundary.
- Clicking the button restores both the saved camera center and the saved zoom through `stageApi.centerOn(..., { scale })`.
- Because the check is directional, a single connection can surface one button, two buttons, or none depending on the current viewport and which endpoints have saved focus views.

## Application Bootstrap

Implemented in [src/main.js](src/main.js).

Responsibilities:

- Create the app via `new App()`
- Register all built-in component instances centrally before plugins mount
- Mount built-in plugin classes in dependency-aware order
- Mount `ConnectionsPlugin` before `FocusNavigationPlugin` so presentation navigation always reads already-updated connection geometry
- Mount `HistoryPlugin` so undo / redo wiring is available after core interaction plugins are in place
- Mount `DocumentPlugin` after history so imported documents can immediately reset the history baseline
- Call `app.start()` to initialize
- Seed a few starter nodes on load
- Reset the local history baseline after starter nodes are added
- In E2E mode, expose the browser test API only after starter nodes have finished loading

## Styling Notes

Implemented in [src/styles.css](src/styles.css).

Design direction:

- Warm paper-like background
- Frosted panel surfaces
- Offline-safe local/system typography with no Google Fonts runtime dependency
- Responsive layout using `rem`
- Root font size adjusted with media queries
- The canvas grid is rendered inside Konva instead of using a CSS background pattern

UI Transitions:

- `is-edit-mode` and `is-presentation-mode` classes on `body` control layout states
- Sidebar and toolbar slide in/out using CSS `transform` and `margin` transitions
- Konva stage automatically resizes via `ResizeObserver` during layout transitions

Responsive behavior:

- Desktop: left sidebar
- Narrow screens: layout stacks

## Current Limitations

- Undo / redo history is local in-memory state only and is lost on full reload
- Save / load is currently manual JSON import/export only; there is no autosave or local draft persistence yet
- There is no collaboration or remote-operation merge model yet
- Loading a document restores board state but not the prior undo / redo stacks, current selection, or the current mode / tool
- Loading also does not restore transient plugin UI state such as open editors, context menus, connection-picking state, or other in-progress interactions
- Import is currently full-replace only; there is no partial import, merge import, or diff/patch flow
- Import is not yet rollback-safe if restore fails midway through the transaction
- Unknown component types and future schema changes do not yet have a robust compatibility / migration strategy
- Undo / redo depends on the mutation event contract; new features that skip `node:change:start` / `node:changed` will not be tracked
- Images are embedded as inline data URLs inside exported JSON, which keeps documents portable but can make files large
- Text editor placement is basic and not fully transformed-aware under all zoom/rotation cases
- Right-click anchor naming uses `window.prompt`
- Alignment guide snapping currently focuses on nearby bounds and viewport center lines, not full smart-layout constraints
- Konva and Lucide are imported from package dependencies through shared module wrappers in `src/lib/`
- Automated coverage now includes core unit tests plus smoke/feature E2E for connections, focus navigation, component editing, and document roundtrips, but it is still not exhaustive for all canvas edge cases

## Expected Workflow For Future Changes

- Keep the app dependency-light
- Preserve vanilla JS module boundaries
- Add new features as classes extending the core base classes
- Prefer putting reusable behavior in `BasePlugin`, `BaseCommand`, `BaseTool`, `BaseContextMenuItem`, or `BaseComponent`
- Add new plugins via `app.use(MyPlugin, options)`
- Add new component types by extending `BaseComponent`
- Declare mode behavior with static `modes`
- Keep stage zoom uniform on `x` and `y`
- Keep transformer scaling ratio-locked unless requirements change
- Prefer adding plugins over modifying core infrastructure
- When adding new UI controls that E2E should target, add stable `data-testid` hooks
- When adding new canvas interactions that need browser verification, extend `src/testApi.js` rather than duplicating fragile test-side coordinate logic
- When adding reversible node mutations, emit `node:change:start` before the mutation and `node:changed` after it
- When adding real-time drag-like updates that should not create repeated history entries, emit `node:changing`
- When adding reversible draw-layer content, provide a single completed-operation event similar to `draw:added`
- Prefer updating `pnpm test` coverage as part of feature work, not as a separate cleanup pass

## Secondary Development Guide

This codebase is designed so that most secondary development only requires extending a base class and implementing callback methods.

### 1. Add a Plugin

Create a class that extends `BasePlugin`.

Minimal pattern:

```js
import { BasePlugin } from "../core/baseClasses.js";

export class MyPlugin extends BasePlugin {
  static pluginId = "my-plugin";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  onSetup() {
    // Initialize Konva nodes, DOM bindings, local state, event listeners
  }

  onModeEnter(ctx) {
    // Optional
  }

  onModeExit(ctx) {
    // Optional
  }

  onModeChange(ctx) {
    // Optional
  }
}
```

Mount it in `src/main.js`:

```js
app.use(MyPlugin, options);
```

Useful `BasePlugin` methods:

- `this.listen(event, handler)`: subscribe to app events with auto-cleanup
- `this.listenDom(target, event, handler, options)`: subscribe to DOM events with auto-cleanup
- `this.registerTool(ToolClass)`
- `this.registerCommand(CommandClass)`
- `this.registerMenuItem(MenuItemClass)`

Current project convention:

- Plugins should not register components
- New component types should be registered centrally in `src/main.js`

### 2. Add a Tool

Create a class that extends `BaseTool`.

```js
import { BaseTool } from "../core/baseClasses.js";

export class LassoTool extends BaseTool {
  static toolId = "lasso";
  static label = "Lasso";

  onActivate() {
    // Optional
  }

  onDeactivate() {
    // Optional
  }
}
```

Return it from a plugin:

```js
tools() {
  return [LassoTool];
}
```

### 3. Add a Command

Create a class that extends `BaseCommand`.

```js
import { BaseCommand } from "../core/baseClasses.js";

export class DuplicateSelectionCommand extends BaseCommand {
  static commandId = "selection:duplicate";
  static label = "Duplicate Selection";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    // Command logic
  }
}
```

Return it from a plugin:

```js
commands() {
  return [DuplicateSelectionCommand];
}
```

Optional keybinding:

```js
this.app.keybindings.register("Mod+D", "selection:duplicate");
this.cleanups.push(() => this.app.keybindings.unregister("Mod+D"));
```

### 4. Add a Context Menu Item

Create a class that extends `BaseContextMenuItem`.

```js
import { BaseContextMenuItem } from "../core/baseClasses.js";

export class FocusNodeMenuItem extends BaseContextMenuItem {
  static itemId = "node:focus";
  static label = "Focus";
  static modes = {
    presentation: {},
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(node) {
    return node?.hasName?.("selectable");
  }

  execute(node) {
    // Menu action
  }
}
```

Return it from a plugin:

```js
menuItems() {
  return [FocusNodeMenuItem];
}
```

### 5. Add a Component

Create a class that extends `BaseComponent`.

```js
import { BaseComponent } from "../core/baseClasses.js";

export class DiamondComponent extends BaseComponent {
  static type = "diamond";
  static label = "Diamond";
  static description = "Decision node";

  async createNode({ x, y }) {
    return new Konva.Line({
      x,
      y,
      points: [60, 0, 120, 50, 60, 100, 0, 50],
      closed: true,
      fill: "#fef8ef",
      stroke: "#c78543",
      strokeWidth: 2,
      draggable: true,
    });
  }
}
```

Register it in `src/main.js`:

```js
app.components.register(new DiamondComponent(app));
```

`BaseComponent` automatically:

- assigns a unique id
- marks the node as selectable
- adds `componentType`
- stores `baseDraggable`

If the component should participate correctly in local undo / redo and document save / load, also implement the serialization hooks used by `HistoryPlugin` and the document serializer:

```js
serializeNode(node) {
  return {
    label: node.findOne(".diamond-label")?.text() ?? "",
  };
}

async applySerializedData(node, data = {}) {
  node.findOne(".diamond-label")?.text(data.label || "");
}
```

`BaseComponent.serialize(...)` and `BaseComponent.restore(...)` already handle shared node state such as:

- `id`
- `x` / `y`
- `rotation`
- `scaleX` / `scaleY`
- `visible`
- `opacity`
- `focusPositionMode`
- `savedFocus`

New component checklist:

1. Add the component file under `src/component/`.
2. Register it centrally in `src/main.js`.
3. Make sure the root node is selectable and draggable when appropriate.
4. Implement `createNode(payload)`.
5. Implement `serializeNode(node)`.
6. Implement `applySerializedData(node, data)`.
7. Add `editorFields()` if the component exposes editable content.
8. If the component mutates outside the editor, emit `node:change:start` before the mutation and `node:changed` after it.
9. Test at least one roundtrip through undo/redo or document load.

Common mistakes:

- Only serializing visible geometry instead of the source data needed to rebuild it
- Forgetting serialization hooks, so the component works until undo/redo or import
- Mutating node state without emitting the history events that reversible features depend on

### 6. Declare Mode Behavior

Mode declarations are static metadata on plugins, commands, and menu items.

Available states:

- `presentation`
- `edit.arrange`
- `edit.brush`
- `edit.eraser`

Example:

```js
static modes = {
  presentation: {},
  edit: {
    tools: {
      arrange: {
        config: { snap: true },
      },
      brush: {
        config: { snap: false },
      },
      eraser: {
        config: { snap: false },
      },
    },
  },
};
```

Mode behavior rules:

- If a mode branch is omitted, the feature is disabled in that state
- If `edit.tools` exists and a specific tool branch is omitted, the feature is disabled for that tool
- `onModeEnter`, `onModeExit`, and `onModeChange` are called automatically by the framework
- Read per-mode config through `this.getModeConfig()`
- Check current state through `this.isEnabled()` or `this.app.modeManager.matches(...)`

### 7. Coordinate and Viewport Helpers

Use the stage controller directly:

```js
this.app.stageApi.screenToCanvas(point)
this.app.stageApi.canvasToScreen(point)
this.app.stageApi.centerOn(point, { duration, scale })
this.app.stageApi.fitNodes(nodes)
this.app.stageApi.resetZoom()
this.app.stageApi.getViewportBounds()
this.app.stageApi.getScreenSize()
```

### 8. Recommended Workflow

When adding a new feature:

1. Create a plugin class if the feature owns behavior or UI
2. Add tool, command, or menu item classes only if the plugin needs them
3. If the feature introduces a new node type, create a `BaseComponent` subclass and register it in `src/main.js`
4. Declare `static modes` first
5. Put setup logic in `onSetup()`
6. Put visibility or enable/disable reactions in `onModeChange()`
7. Register the plugin in `src/main.js`

Start by copying the closest built-in example:

- `SelectionPlugin` for stage interactions
- `DrawingPlugin` for tool-driven pointer behavior
- `ToolbarPlugin` for DOM UI
- `ContainersPlugin` for combined commands and context menu items
- `TextComponent` or `StickyComponent` for editable components
- `ContainerComponent` for complex nested components

## Verification

The project has been verified with:

- `node --check` on source modules
- `pnpm build`
- `pnpm test:unit`
- `pnpm test:e2e`
- `pnpm test`
