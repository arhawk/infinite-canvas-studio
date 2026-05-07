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
      exportTemplate: "<html>shell</html>",
    })).toBe("<html>shell</html>");
  });

  it("returns empty when shell is missing", () => {
    expect(resolveRuntimeHtmlTemplate({
      exportTemplate: "",
    })).toBe("");
  });
});
