import { describe, expect, it } from "vitest";
import {
  getDocumentExportFormat,
  resolveRuntimeHtmlTemplate,
} from "../../../src/plugins/documentExportMode.js";

describe("documentExportMode", () => {
  it("uses html export in dev mode", () => {
    expect(getDocumentExportFormat({ isDevMode: true, isStandaloneSingleFile: false })).toBe("html");
  });

  it("uses html export in standalone single-file mode", () => {
    expect(getDocumentExportFormat({ isDevMode: false, isStandaloneSingleFile: true })).toBe("html");
  });

  it("prefers prebuilt shell template when available", () => {
    expect(resolveRuntimeHtmlTemplate({
      isDevMode: true,
      exportTemplate: "<html>shell</html>",
      runtimeTemplate: "<html>runtime</html>",
    })).toBe("<html>shell</html>");
  });

  it("returns empty template in dev when shell is missing", () => {
    expect(resolveRuntimeHtmlTemplate({
      isDevMode: true,
      exportTemplate: "",
      runtimeTemplate: "<html>runtime</html>",
    })).toBe("");
  });

  it("falls back to runtime template outside dev", () => {
    expect(resolveRuntimeHtmlTemplate({
      isDevMode: false,
      exportTemplate: "",
      runtimeTemplate: "<html>runtime</html>",
    })).toBe("<html>runtime</html>");
  });
});
