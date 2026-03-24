# Mind Map Infinite Canvas

A vanilla JavaScript mind-map board built on Konva.js with a lightweight Vite setup. The app combines an infinite canvas, draggable components, single-node selection and transform, edit-mode canvas panning, freehand drawing, editable content blocks, and container-to-container connections in a dependency-light architecture designed for extension.

## Highlights

- A fixed-size landscape `Page` component appears first in the palette and can contain other components like a container.
- Presentation focus views can be saved from the toolbar or the context menu.
- Toolbar helper controls are contextual: `arrange` shows connection and focus actions when a focusable node is selected, while `brush` shows color and stroke controls only when that tool is active.
- Each focusable component tracks its own focus mode (`absolute` or `relative`). Regular components default to `absolute`, while `Page` starts with a centered relative focus.
- Relative focus keeps presentation framing attached to the component when that component moves.
- In presentation mode, saved focuses can be reached from connection edge buttons or by double-clicking the component itself.

## Stack

- pnpm
- Vite
- Vanilla JavaScript
- Konva.js
- Lucide Icons

## Development

```bash
pnpm install
pnpm dev
```

The Vite dev server runs on `http://localhost:3000`.

## Build

```bash
pnpm build
pnpm preview
```

## Testing

```bash
pnpm test:unit
pnpm test:e2e
pnpm test
```

Current automated coverage includes:

- Core unit tests for registries, mode management, keybindings, and base classes
- Playwright smoke tests for mode toggle, palette add/delete flow, and brush drawing
- Playwright feature tests for connection creation/update, toolbar `Save Focus`, presentation navigation buttons, and component editor editing

On a new machine, install the Playwright browser once before the first E2E run:

```bash
pnpm exec playwright install chromium
```

## Project Structure

- `index.html`: application shell
- `src/main.js`: app bootstrap
- `src/styles.css`: global styles
- `src/core/`: app infrastructure and registries
- `src/plugins/`: feature plugins
- `src/component/`: component definitions

## Notes

- Image uploads currently rely on object URLs and are not persisted.
- Manual browser testing is still recommended for new interaction-heavy edge cases beyond the current automated coverage.
