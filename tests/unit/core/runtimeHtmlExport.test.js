import { describe, expect, it } from "vitest";
import { buildRuntimeExportHtml } from "../../../src/document/runtimeHtmlExport.js";

describe("buildRuntimeExportHtml", () => {
  it("injects the latest snapshot into the runtime html template", () => {
    const template = `<!doctype html>
<html lang="en">
  <head>
    <title>Old Title</title>
    <script id="app-snapshot" type="application/json"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;

    const html = buildRuntimeExportHtml(template, {
      documentId: "doc-1",
      revision: 2,
      meta: { title: "Deck Demo" },
      savedAt: "2026-04-05T10:00:00.000Z",
      view: {
        scale: 1,
        position: { x: 0, y: 0 },
      },
      nodes: [],
      drawings: [],
    }, {
      title: "Deck Demo",
    });

    expect(html).toContain("<title>Deck Demo</title>");
    expect(html).toContain('"documentId": "doc-1"');
    expect(html).toContain('id="app-snapshot"');
  });

  it("removes document import and export controls from runtime html exports", () => {
    const template = `<!doctype html>
<html lang="en">
  <head>
    <title>Old Title</title>
  </head>
  <body>
    <div id="document-controls">
      <button id="save-document-action">Save</button>
      <button id="load-document-action">Load</button>
    </div>
    <div id="arrange-controls"></div>
  </body>
</html>`;

    const html = buildRuntimeExportHtml(template, {
      documentId: "doc-1",
      revision: 2,
      meta: { title: "Deck Demo" },
      savedAt: "2026-04-05T10:00:00.000Z",
      view: {
        scale: 1,
        position: { x: 0, y: 0 },
      },
      nodes: [],
      drawings: [],
    });

    expect(html).not.toContain('id="document-controls"');
    expect(html).not.toContain('id="save-document-action"');
    expect(html).not.toContain('id="load-document-action"');
    expect(html).toContain('id="arrange-controls"');
  });

  it("keeps adjacent toolbar controls when removing document controls", () => {
    const template = `<!doctype html>
<html lang="en">
  <head>
    <title>Old Title</title>
  </head>
  <body>
    <div id="document-controls">
      <button id="save-document-action">Save</button>
      <button id="load-document-action">Load</button>
    </div>
    <div id="catalog-controls">
      <button id="catalog-toggle">Outline</button>
    </div>
    <div id="arrange-controls"></div>
  </body>
</html>`;

    const html = buildRuntimeExportHtml(template, {
      documentId: "doc-1",
      revision: 2,
      meta: { title: "Deck Demo" },
      savedAt: "2026-04-05T10:00:00.000Z",
      view: {
        scale: 1,
        position: { x: 0, y: 0 },
      },
      nodes: [],
      drawings: [],
    });

    expect(html).not.toContain('id="document-controls"');
    expect(html).toContain('id="catalog-controls"');
    expect(html).toContain('id="catalog-toggle"');
    expect(html).toContain('id="arrange-controls"');
  });
});
