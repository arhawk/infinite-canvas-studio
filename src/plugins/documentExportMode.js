export function getDocumentExportFormat({ isExportTemplateBuild = false, isDevMode = false } = {}) {
  if (isExportTemplateBuild) return "html";
  if (isDevMode) return "html";
  return "json";
}

export function resolveRuntimeHtmlTemplate({ exportTemplate = "" } = {}) {
  if (typeof exportTemplate === "string" && exportTemplate.trim()) {
    return exportTemplate;
  }

  return "";
}
