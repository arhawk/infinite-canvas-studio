import { describe, expect, it } from "vitest";
import {
  getDocumentExportFormat,
  resolveRuntimeHtmlTemplate,
} from "../../../src/plugins/documentExportMode.js";

describe("documentExportMode", () => {
  it("uses html export in dev mode", () => {
    expect(getDocumentExportFormat({ isDevMode: true, isExportTemplateBuild: false })).toBe("html");
  });

  it("uses html export in export-template build mode", () => {
    expect(getDocumentExportFormat({ isDevMode: false, isExportTemplateBuild: true })).toBe("html");
  });

  it("prefers prebuilt export template when available", () => {
    expect(resolveRuntimeHtmlTemplate({
      exportTemplate: "<html>template</html>",
    })).toBe("<html>template</html>");
  });

  it("returns empty when export template is missing", () => {
    expect(resolveRuntimeHtmlTemplate({
      exportTemplate: "",
    })).toBe("");
  });
});
