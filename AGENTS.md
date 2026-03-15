# Commit Convention
https://www.conventionalcommits.org/en/v1.0.0/

# Mind Map Infinite Canvas

## Overview

This repository contains a mind map infinite canvas application built with Bun, vanilla JavaScript, and Konva.js.

The app now uses a class-based architecture centered on an `App` object, a `ModeManager`, a `StageController`, and a small set of base classes for plugins, tools, commands, context menu items, and components.

The app includes:

- Infinite canvas pan and zoom
- Drag-and-drop component palette
- Editable text and sticky notes
- Select, multi-select, marquee select, and transform
    - Freehand brush drawing
    - Container system with parent-child grouping and inter-container connections
    - Persistent mode toggle (Edit/View) with animated UI transitions
- Icon-based tool interface using Lucide Icons
- Class-based extension points for secondary development

## Tech Stack

- Runtime: Bun
- Frontend: Vanilla JavaScript
- Canvas library: Konva.js
- Icon library: Lucide Icons
- Styling: Plain CSS

## Run Commands

- Install dependencies: `bun install`
- Start local dev server: `bun run dev`
- Build static output: `bun run build`

The dev server runs from [server.js](/Users/baitian/Developer/konva-proto/server.js) and serves the project at `http://localhost:3000`.

## Project Structure

### Static Files

- [index.html](/Users/baitian/Developer/konva-proto/index.html): Main application shell
- [styles.css](/Users/baitian/Developer/konva-proto/styles.css): Global layout and visual styling
- [server.js](/Users/baitian/Developer/konva-proto/server.js): Bun-based static development server
- [build.js](/Users/baitian/Developer/konva-proto/build.js): Copies static assets into `dist/`

### Entry Point

- [src/main.js](/Users/baitian/Developer/konva-proto/src/main.js): App bootstrap — creates `App`, registers built-in components, registers built-in plugins, starts the app

### Core Infrastructure (`src/core/`)

- [src/core/app.js](/Users/baitian/Developer/konva-proto/src/core/app.js): `App` class with lifecycle, stage wiring, registries, plugin mounting, and public API
- [src/core/baseClasses.js](/Users/baitian/Developer/konva-proto/src/core/baseClasses.js): Core extension base classes: `BasePlugin`, `BaseTool`, `BaseCommand`, `BaseContextMenuItem`, `BaseComponent`
- [src/core/modeManager.js](/Users/baitian/Developer/konva-proto/src/core/modeManager.js): Central mode state machine for `presentation`, `edit.arrange`, and `edit.brush`
- [src/core/eventBus.js](/Users/baitian/Developer/konva-proto/src/core/eventBus.js): `EventBus` class for decoupled app events
- [src/core/commandRegistry.js](/Users/baitian/Developer/konva-proto/src/core/commandRegistry.js): `CommandRegistry` for class-based commands
- [src/core/toolRegistry.js](/Users/baitian/Developer/konva-proto/src/core/toolRegistry.js): `ToolRegistry` for class-based tools
- [src/core/keybindingRegistry.js](/Users/baitian/Developer/konva-proto/src/core/keybindingRegistry.js): `KeybindingRegistry` for keyboard shortcuts
- [src/core/contextMenuRegistry.js](/Users/baitian/Developer/konva-proto/src/core/contextMenuRegistry.js): `ContextMenuRegistry` for class-based right-click items
- [src/core/componentRegistry.js](/Users/baitian/Developer/konva-proto/src/core/componentRegistry.js): `ComponentRegistry` for class-based components

### Plugins (`src/plugins/`)

- [src/plugins/toolbar.js](/Users/baitian/Developer/konva-proto/src/plugins/toolbar.js): Toolbar UI plugin with icon-based tool buttons, persistent mode toggle, stroke controls, and zoom commands
- [src/plugins/sidebar.js](/Users/baitian/Developer/konva-proto/src/plugins/sidebar.js): Component palette plugin with drag/drop and image upload using Lucide placeholders
- [src/plugins/selection.js](/Users/baitian/Developer/konva-proto/src/plugins/selection.js): Selection plugin with arrange tool, transformer, marquee select, snap guides, delete command, and mode-based interactivity management
- [src/plugins/drawing.js](/Users/baitian/Developer/konva-proto/src/plugins/drawing.js): Drawing plugin with brush tool
- [src/plugins/containers.js](/Users/baitian/Developer/konva-proto/src/plugins/containers.js): Container system plugin with inter-container links and capture/release logic
- [src/plugins/contextMenu.js](/Users/baitian/Developer/konva-proto/src/plugins/contextMenu.js): Canvas context menu plugin rendering Konva-based menus

### Stage

- [src/stage.js](/Users/baitian/Developer/konva-proto/src/stage.js): `StageController` class for pan, zoom, grid rendering, coordinate conversion, and viewport helpers

### Component Definitions (`src/component/`)

- [src/component/editableText.js](/Users/baitian/Developer/konva-proto/src/component/editableText.js): `EditableTextBehavior` for inline text editing
- [src/component/text.js](/Users/baitian/Developer/konva-proto/src/component/text.js): `TextComponent`
- [src/component/sticky.js](/Users/baitian/Developer/konva-proto/src/component/sticky.js): `StickyComponent`
- [src/component/image.js](/Users/baitian/Developer/konva-proto/src/component/image.js): `ImageComponent`
- [src/component/rect.js](/Users/baitian/Developer/konva-proto/src/component/rect.js): `RectComponent`
- [src/component/circle.js](/Users/baitian/Developer/konva-proto/src/component/circle.js): `CircleComponent`
- [src/component/arrow.js](/Users/baitian/Developer/konva-proto/src/component/arrow.js): `ArrowComponent`
- [src/component/container.js](/Users/baitian/Developer/konva-proto/src/component/container.js): `ContainerComponent` for grouping and connecting nodes

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

The app object (`window.__mindMapApp` in the browser) exposes:

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
- Top toolbar: tools, stroke settings, zoom controls
- Main board: Konva infinite canvas

## Implemented Features

### 1. Infinite Canvas

Implemented in [src/stage.js](/Users/baitian/Developer/konva-proto/src/stage.js).

- Mouse wheel zooms the stage
- Zoom is applied uniformly on both axes
- Zoom range is clamped between `0.1` and `5`
- Middle mouse drag pans the stage
- Space plus drag also pans the stage
- In presentation mode, primary drag also pans the viewport
- A Konva grid layer redraws with pan and zoom so the grid scales with the canvas
- `Fit All` centers and scales all visible content into view
- `Cmd/Ctrl + 0` resets zoom to `100%`

### 2. Coordinate Conversion

Implemented in [src/stage.js](/Users/baitian/Developer/konva-proto/src/stage.js).

Core methods on `StageController`:

```js
app.stageApi.screenToCanvas(point)
app.stageApi.canvasToScreen(point)
```

This is used for:

- Dropping sidebar components onto the canvas
- Freehand drawing under pan and zoom
- Positioning new content in canvas coordinates

### 3. Sidebar Component Palette

Implemented in [src/plugins/sidebar.js](/Users/baitian/Developer/konva-proto/src/plugins/sidebar.js).

Available component types:

- Text
- Sticky Note
- Image
- Rectangle
- Circle
- Arrow

Behavior:

- Non-image components are draggable from the sidebar onto the canvas
- Image icon in the sidebar is draggable and creates a placeholder on the canvas. Double-clicking the placeholder (or any image) opens the component editor to upload or change the image file.
- Drop coordinates are converted from screen space to canvas space.

### 4. Component System

Implemented in [src/core/componentRegistry.js](/Users/baitian/Developer/konva-proto/src/core/componentRegistry.js) with definitions in `src/component/`.

Structure:

- Each component is a class extending `BaseComponent`
- Shared inline text editing lives in [src/component/editableText.js](/Users/baitian/Developer/konva-proto/src/component/editableText.js)
- Components are registered as instantiated classes via `app.components.register(new MyComponent(app))`

Current component classes:

- `text`
- `sticky`
- `image`
- `rect`
- `circle`
- `arrow`

Component rules:

- `BaseComponent` assigns a unique `id`
- `BaseComponent` marks component nodes with `name: "selectable"` and `componentType`
- Components control their own Konva node creation through `createNode(payload)`
- Text-like components reuse `EditableTextBehavior`
- New components should be added by extending `BaseComponent`

### 5. Selection and Transform

Implemented in [src/plugins/selection.js](/Users/baitian/Developer/konva-proto/src/plugins/selection.js).

Supported interactions:

- Click to select a single node
- Shift-click for multi-select
- Drag on empty canvas for marquee selection
- Drag and transform show Konva alignment guides and snap to nearby edges or centers
- `Delete` or `Backspace` removes selected nodes (via `selection:delete` command)

Transformer rules:

- Rotation is enabled
- Scaling is ratio-locked
- Only corner anchors are enabled
- Side anchors are disabled
- Flip is disabled

This means all transformed nodes can only be scaled proportionally.

### 6. Freehand Drawing

Implemented in [src/plugins/drawing.js](/Users/baitian/Developer/konva-proto/src/plugins/drawing.js).

Supported tools:

- `brush`

Behavior:

- Brush creates Konva lines with rounded caps and joins
- Drawing happens only on empty stage area
- Drawing coordinates respect current pan and zoom

### 7. Toolbar

Implemented in [src/plugins/toolbar.js](/Users/baitian/Developer/konva-proto/src/plugins/toolbar.js).

Controls:

- Persistent mode toggle (Edit/View) centered at the top
- Icon-based tool buttons (rendered from tool registry using Lucide Icons)
- Color picker (enabled only for brush tool)
- Stroke width slider (enabled only for brush tool)
- Zoom label and reset button
- Fit All button

Registered commands: `zoom:reset`, `fit:all`

### 8. Context Menu

Implemented in [src/plugins/contextMenu.js](/Users/baitian/Developer/konva-proto/src/plugins/contextMenu.js).

Behavior:

- Right-click a selectable component to see available actions
- Menu items are dynamically gathered from `app.contextMenu.getItems(target)`
- The menu is rendered as a Konva overlay on the UI layer

    ### 9. Containers and Connections
    
    Implemented in [src/plugins/containers.js](/Users/baitian/Developer/konva-proto/src/plugins/containers.js).
    
    Behavior:
    
    - Dragging a selectable component over a container and releasing it **captures** the component as a child of the container.
    - Dragging a child component out of the container bounds **releases** it back to the main layer.
    - Right-click a container to **Link to Container...**, creating a smooth, mind-map style cubic Bezier connection line to another container. Connections automatically clip to container boundaries and intelligently choose the best entry/exit points (top/bottom or left/right).
    - Right-click options allow removing specific links or clearing all connections.
    - Container labels are editable via double-click.
    
    ## Application Bootstrap

Implemented in [src/main.js](/Users/baitian/Developer/konva-proto/src/main.js).

Responsibilities:

- Create the app via `new App()`
- Register built-in component instances
- Mount built-in plugin classes
- Call `app.start()` to initialize
- Seed a few starter nodes on load
- Expose `window.__mindMapApp` for secondary development

## Styling Notes

Implemented in [styles.css](/Users/baitian/Developer/konva-proto/styles.css).

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
- Text editor placement is basic and not fully transformed-aware under all zoom/rotation cases
- Right-click anchor naming uses `window.prompt`
- Alignment guide snapping currently focuses on nearby bounds and viewport center lines, not full smart-layout constraints
- Konva is loaded from a CDN script in [index.html](/Users/baitian/Developer/konva-proto/index.html)

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
    return new window.Konva.Line({
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
this.app.stageApi.centerOn(point)
this.app.stageApi.fitNodes(nodes)
this.app.stageApi.resetZoom()
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
- `bun run build`
- Browser testing at `http://localhost:3000`

Manual browser testing is still recommended after UI behavior changes.
