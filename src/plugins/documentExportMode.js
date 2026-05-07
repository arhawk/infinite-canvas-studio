export function getDocumentExportFormat({ isStandaloneSingleFile = false, isDevMode = false } = {}) {
  if (isStandaloneSingleFile) return "html";
  if (isDevMode) return "html";
  return "json";
}

export function resolveRuntimeHtmlTemplate({ exportTemplate = "" } = {}) {
  if (typeof exportTemplate === "string" && exportTemplate.trim()) {
    return exportTemplate;
  }

  return "";
}
