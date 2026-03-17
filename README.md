# Mind Map Infinite Canvas

A vanilla JavaScript mind-map board built on Konva.js with a lightweight Vite setup. The app combines an infinite canvas, draggable components, freehand drawing, selection tools, editable content blocks, and container-to-container connections in a dependency-light architecture designed for extension.

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

## Project Structure

- `index.html`: application shell
- `src/main.js`: app bootstrap
- `src/styles.css`: global styles
- `src/core/`: app infrastructure and registries
- `src/plugins/`: feature plugins
- `src/component/`: component definitions

## Notes

- The app exposes `window.__mindMapApp` for local experimentation and extension.
- Image uploads currently rely on object URLs and are not persisted.
- Manual browser testing is still recommended for interaction-heavy changes.
