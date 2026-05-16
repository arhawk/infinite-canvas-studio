import { describe, expect, it } from "vitest";
import {
  buildRuntimeExportHtml,
  readEmbeddedSnapshotFromHtmlText,
  validateRuntimeExportTemplate,
  validateEmbeddedSnapshotInHtml,
} from "../../../src/document/runtimeHtmlExport.js";

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

  it("keeps document import and export controls in runtime html exports", () => {
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

    expect(html).toContain('id="document-controls"');
    expect(html).toContain('id="save-document-action"');
    expect(html).toContain('id="load-document-action"');
    expect(html).toContain('id="arrange-controls"');
  });

  it("keeps adjacent toolbar controls with document controls present", () => {
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

    expect(html).toContain('id="document-controls"');
    expect(html).toContain('id="catalog-controls"');
    expect(html).toContain('id="catalog-toggle"');
    expect(html).toContain('id="arrange-controls"');
  });

  it("validates embedded snapshot identity and content counts", () => {
    const snapshot = {
      documentId: "doc-1",
      revision: 2,
      meta: { title: "Deck Demo" },
      savedAt: "2026-04-05T10:00:00.000Z",
      view: {
        scale: 1,
        position: { x: 0, y: 0 },
      },
      nodes: [
        {
          id: "n-1",
          type: "sticky",
          x: 0,
          y: 0,
          width: 120,
          height: 120,
          data: {},
        },
      ],
      drawings: [],
    };
    const template = "<!doctype html><html><head><title>Old</title></head><body></body></html>";
    const html = buildRuntimeExportHtml(template, snapshot);

    expect(validateEmbeddedSnapshotInHtml(html, snapshot)).toBe(true);
  });

  it("fails validation when snapshot node count does not match", () => {
    const snapshot = {
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
    };
    const template = "<!doctype html><html><head><title>Old</title></head><body></body></html>";
    const html = buildRuntimeExportHtml(template, snapshot);

    expect(() => validateEmbeddedSnapshotInHtml(html, {
      ...snapshot,
      nodes: [
        {
          id: "n-1",
          type: "sticky",
          x: 0,
          y: 0,
          width: 120,
          height: 120,
          data: {},
        },
      ],
    })).toThrow("node count");
  });

  it("reads embedded snapshot from exported html text", () => {
    const snapshot = {
      documentId: "doc-2",
      revision: 3,
      meta: { title: "Roundtrip" },
      savedAt: "2026-04-05T10:00:00.000Z",
      view: { scale: 1, position: { x: 0, y: 0 } },
      nodes: [],
      drawings: [],
    };
    const template = "<!doctype html><html><head><title>Old</title></head><body></body></html>";
    const html = buildRuntimeExportHtml(template, snapshot);
    const parsed = readEmbeddedSnapshotFromHtmlText(html);

    expect(parsed?.documentId).toBe("doc-2");
    expect(parsed?.revision).toBe(3);
  });

  it("rejects templates missing body/html shell", () => {
    expect(() => validateRuntimeExportTemplate("")).toThrow("missing");
    expect(() =>
      validateRuntimeExportTemplate("<!doctype html><html><head><title>X</title></head></html>"),
    ).toThrow("missing <body>");
    expect(() =>
      buildRuntimeExportHtml("<!doctype html><html><head></head><body><div id='app'></div></html>", {
        documentId: "doc-1",
        revision: 1,
        meta: { title: "T" },
        nodes: [],
        drawings: [],
      }),
    ).toThrow("missing </body>");
  });
});
