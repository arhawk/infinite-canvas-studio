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
- Freehand brush drawing
- Container system with parent-child grouping and arbitrary component-to-component connections
- Per-component saved focus views for presentation jumps
- Persistent mode toggle (Edit/View) with animated UI transitions
- Icon-based tool interface using Lucide Icons
- Class-based extension points for secondary development

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
- Preview production build: `pnpm preview`

The Vite dev server is configured in [vite.config.js](vite.config.js) and runs at `http://localhost:3000`.

## Project Structure

### Static Files

- [index.html](index.html): Main application shell
- [src/styles.css](src/styles.css): Global layout and visual styling
- [vite.config.js](vite.config.js): Vite dev and preview server configuration

### Entry Point

- [src/main.js](src/main.js): App bootstrap — creates `App`, registers built-in components, registers built-in plugins, starts the app

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

- [src/plugins/toolbar.js](src/plugins/toolbar.js): Toolbar UI plugin with icon-based tool buttons, persistent mode toggle, stroke controls, focus controls, and zoom commands
- [src/plugins/sidebar.js](src/plugins/sidebar.js): Component palette plugin with drag/drop and image upload using Lucide placeholders
- [src/plugins/selection.js](src/plugins/selection.js): Selection plugin with arrange tool, single-node transformer, snap guides, delete command, and mode-based interactivity management
- [src/plugins/drawing.js](src/plugins/drawing.js): Drawing plugin with brush tool
- [src/plugins/containers.js](src/plugins/containers.js): Container system plugin with capture/release logic
- [src/plugins/connections.js](src/plugins/connections.js): Generic connection plugin with component-to-component linking, selectable curved connectors, and control handles
- [src/plugins/focusNavigation.js](src/plugins/focusNavigation.js): Focus and presentation navigation plugin with per-component saved camera views, per-component absolute/relative focus mode state, bidirectional edge jump buttons, toolbar/context-menu `Save Focus`, and presentation double-click navigation
- [src/plugins/contextMenu.js](src/plugins/contextMenu.js): Canvas context menu plugin rendering Konva-based menus

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
- `components()`
- `onSetup()`
- `onModeEnter()`
- `onModeExit()`
- `onModeChange()`

The base class handles registration, cleanup, and mode lifecycle wiring.

### Mode System

The entire app is organized around these interaction states:

- `presentation`
- `edit.arrange`
- `edit.brush`

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
| `node:added` | `{ node }` | app.addComponent |
| `node:removed` | `{ node }` | selection plugin (delete) |
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
- Top toolbar: tools, focus controls, stroke settings, zoom controls
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
- Components can opt out of appearing in the sidebar by setting `static palette = false`
- Text-like components reuse `EditableTextBehavior`
- New components should be added by extending `BaseComponent`

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

Behavior:

- Brush creates Konva lines with rounded caps and joins
- Drawing happens only on empty stage area
- Drawing coordinates respect current pan and zoom

### 7. Toolbar

Implemented in [src/plugins/toolbar.js](src/plugins/toolbar.js).

Controls:

- Persistent mode toggle (Edit/View) centered at the top
- Icon-based tool buttons (rendered from tool registry using Lucide Icons)
- `Save Focus` button for the current selection in `edit.arrange`
- `Focus: Absolute / Relative` toggle that reflects and updates the selected component's own focus mode
- Color picker (enabled only for brush tool)
- Stroke width slider (enabled only for brush tool)

### 8. Context Menu

Implemented in [src/plugins/contextMenu.js](src/plugins/contextMenu.js).

Behavior:

- Right-click a selectable component to see available actions
- Menu items are dynamically gathered from `app.contextMenu.getItems(target)`
- The menu is rendered as a Konva overlay on the UI layer
- In `edit.arrange`, non-connection components expose both connection actions and the `Save Focus` action supplied by feature plugins

### 9. Containers and Connections

Implemented in [src/plugins/containers.js](src/plugins/containers.js), [src/plugins/connections.js](src/plugins/connections.js), and [src/component/connection.js](src/component/connection.js).

Behavior:

- Dragging a selectable component over a container and releasing it **captures** the component as a child of the container.
- Dragging a child component out of the container bounds **releases** it back to the main layer.
- Right-click any non-connection component to **Connect to...** another component.
- Connections are real selectable nodes, so they can be selected, deleted, edited, and adjusted via visible curve control handles when selected in `edit.arrange`.
- The rendered connector uses an arrowhead, but presentation navigation treats the connection as navigable in both directions.
- Container labels are editable via double-click.

### 10. Saved Focus Views And Presentation Navigation

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
- A direction is eligible only when the saved focus center is farther from the current screen center than one current viewport diagonal.
- When eligible, the plugin samples the rendered Bezier curve, finds where that directional curve exits the viewport, and places a floating edge button slightly inside the boundary.
- Clicking the button restores both the saved camera center and the saved zoom through `stageApi.centerOn(..., { scale })`.
- Because the check is directional, a single connection can surface one button, two buttons, or none depending on the current viewport and which endpoints have saved focus views.

## Application Bootstrap

Implemented in [src/main.js](src/main.js).

Responsibilities:

- Create the app via `new App()`
- Register built-in component instances
- Mount built-in plugin classes in dependency-aware order
- Mount `ConnectionsPlugin` before `FocusNavigationPlugin` so presentation navigation always reads already-updated connection geometry
- Call `app.start()` to initialize
- Seed a few starter nodes on load

## Styling Notes

Implemented in [src/styles.css](src/styles.css).

Design direction:

- Warm paper-like background
- Frosted panel surfaces
- `IBM Plex Sans` and `Space Grotesk` typography
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

- Images are created from local object URLs and are not persisted
- There is no save/load document format yet
- There is no undo/redo yet
- Saved focus views currently live only on in-memory node attrs, so they are lost on full reload until a document persistence format exists
- Text editor placement is basic and not fully transformed-aware under all zoom/rotation cases
- Right-click anchor naming uses `window.prompt`
- Alignment guide snapping currently focuses on nearby bounds and viewport center lines, not full smart-layout constraints
- Konva and Lucide are imported from package dependencies through shared module wrappers in `src/lib/`

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
- `this.registerComponent(ComponentClass)`

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

### 6. Declare Mode Behavior

Mode declarations are static metadata on plugins, commands, and menu items.

Available states:

- `presentation`
- `edit.arrange`
- `edit.brush`

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
3. Declare `static modes` first
4. Put setup logic in `onSetup()`
5. Put visibility or enable/disable reactions in `onModeChange()`
6. Register the plugin in `src/main.js`

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
