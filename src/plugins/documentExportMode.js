export function getDocumentExportFormat({ isStandaloneSingleFile = false, isDevMode = false } = {}) {
  if (isStandaloneSingleFile) return "html";
  if (isDevMode) return "html";
  return "json";
}

export function resolveRuntimeHtmlTemplate({
  isDevMode = false,
  exportTemplate = "",
  runtimeTemplate = "",
} = {}) {
  if (typeof exportTemplate === "string" && exportTemplate.trim()) {
    return exportTemplate;
  }

  if (isDevMode) {
    return "";
  }

  return typeof runtimeTemplate === "string" ? runtimeTemplate : "";
}
