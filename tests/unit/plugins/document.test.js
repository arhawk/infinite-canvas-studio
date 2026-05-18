import { describe, expect, it, vi } from "vitest";

vi.mock("konva", () => ({ default: {} }));

import { DocumentPlugin } from "../../../src/plugins/document.js";

describe("DocumentPlugin html export", () => {
  it("throws and blocks download when export template is missing", async () => {
    const originalTemplate = window.__APP_EXPORT_TEMPLATE__;
    window.__APP_EXPORT_TEMPLATE__ = "";

    const emitSpy = vi.fn();

    const fakePlugin = {
      serializeDocument: () => ({
        schemaVersion: 1,
        documentId: "doc-1",
        revision: 1,
        meta: { title: "Untitled" },
        nodes: [],
        drawings: [],
        viewport: { x: 0, y: 0, scale: 1 },
      }),
      resolveExportFormat: () => "html",
      getSuggestedFilename: () => "mind-map-r1",
      getRuntimeHtmlTemplate: () => "",
      ensureRuntimeHtmlTemplate: async () => {
        throw new Error(
          "HTML export template is unavailable (HTTP 404). Please ensure /__export-template is accessible.",
        );
      },
      documentState: { title: "Untitled" },
      showStatus: vi.fn(),
      app: { events: { emit: emitSpy } },
    };

    await expect(
      DocumentPlugin.prototype.exportDocument.call(fakePlugin, {
        download: true,
        format: "html",
      }),
    ).rejects.toThrow(
      "HTML export template is unavailable (HTTP 404). Please ensure /__export-template is accessible.",
    );

    expect(emitSpy).not.toHaveBeenCalled();
    window.__APP_EXPORT_TEMPLATE__ = originalTemplate;
  });

  it("wraps disabled proj menu item with hoverable reason", () => {
    const button = document.createElement("button");
    button.disabled = true;
    const wrapped = DocumentPlugin.prototype.wrapMenuItemForDisabledHint.call(
      {},
      button,
      "reason",
    );
    expect(wrapped).not.toBe(button);
    expect(wrapped.getAttribute("title")).toBe("reason");
  });
});
