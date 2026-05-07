import { normalizeDocumentSnapshot, stringifyDocumentSnapshot } from "./schema.js";

const SNAPSHOT_SCRIPT_ID = "app-snapshot";

function hasTag(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b`, "i");
  return pattern.test(html);
}

function hasClosingBodyTag(html) {
  return /<\/body>/i.test(html);
}

export function validateRuntimeExportTemplate(template) {
  if (typeof template !== "string" || !template.trim()) {
    throw new Error("HTML export template is missing.");
  }

  const normalized = template.trim();
  if (!/^<!doctype html>/i.test(normalized)) {
    throw new Error("HTML export template is incomplete: missing <!doctype html>.");
  }
  if (!hasTag(normalized, "html")) {
    throw new Error("HTML export template is incomplete: missing <html>.");
  }
  if (!hasTag(normalized, "body")) {
    throw new Error("HTML export template is incomplete: missing <body>.");
  }
  if (!hasClosingBodyTag(normalized)) {
    throw new Error("HTML export template is incomplete: missing </body>.");
  }

  return normalized;
}

function escapeScriptJson(json) {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripDocumentControls(html) {
  return html.replace(
    /\s*<div\b[^>]*\bid=["']document-controls["'][^>]*>[\s\S]*?<\/div>/i,
    "",
  );
}

export function captureRuntimeHtmlTemplate(doc = document) {
  if (!doc?.documentElement) return "";

  const html = `<!doctype html>\n${doc.documentElement.outerHTML}`;
  if (typeof window !== "undefined") {
    window.__APP_HTML_TEMPLATE__ = html;
  }
  return html;
}

export function readEmbeddedSnapshot(doc = document) {
  const snapshotEl = doc?.getElementById?.(SNAPSHOT_SCRIPT_ID);
  const raw = snapshotEl?.textContent?.trim?.() ?? "";
  if (!raw) return null;

  try {
    return normalizeDocumentSnapshot(JSON.parse(raw));
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function readEmbeddedSnapshotFromHtmlText(htmlText) {
  if (typeof htmlText !== "string" || !htmlText.trim()) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  return readEmbeddedSnapshot(doc);
}

export function buildRuntimeExportHtml(template, snapshot, { title = "Mind Map Infinite Canvas" } = {}) {
  validateRuntimeExportTemplate(template);

  const normalized = normalizeDocumentSnapshot(snapshot);
  const snapshotJson = escapeScriptJson(stringifyDocumentSnapshot(normalized));
  const safeTitle = escapeHtml(title);

  let html = stripDocumentControls(template);
  const snapshotTagPattern = new RegExp(
    `<script[^>]*id=["']${SNAPSHOT_SCRIPT_ID}["'][^>]*>[\\s\\S]*?<\\/script>`,
    "i",
  );

  if (snapshotTagPattern.test(html)) {
    html = html.replace(
      snapshotTagPattern,
      `<script id="${SNAPSHOT_SCRIPT_ID}" type="application/json">${snapshotJson}</script>`,
    );
  } else {
    if (!hasClosingBodyTag(html)) {
      throw new Error("HTML export template is incomplete: missing </body>.");
    }
    html = html.replace(/<\/body>/i, `  <script id="${SNAPSHOT_SCRIPT_ID}" type="application/json">${snapshotJson}</script>\n</body>`);
  }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  validateRuntimeExportTemplate(html);
  return html;
}

function readSnapshotJsonFromHtml(html) {
  const snapshotTagPattern = new RegExp(
    `<script[^>]*id=["']${SNAPSHOT_SCRIPT_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const match = snapshotTagPattern.exec(html);
  if (!match) {
    throw new Error("Exported HTML is missing #app-snapshot.");
  }

  const raw = match[1]?.trim?.() ?? "";
  if (!raw) {
    throw new Error("Exported HTML contains an empty #app-snapshot.");
  }

  try {
    return normalizeDocumentSnapshot(JSON.parse(raw));
  } catch {
    throw new Error("Exported HTML contains invalid snapshot JSON.");
  }
}

export function validateEmbeddedSnapshotInHtml(html, snapshot) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Exported HTML is empty.");
  }

  const expected = normalizeDocumentSnapshot(snapshot);
  const embedded = readSnapshotJsonFromHtml(html);

  if (embedded.documentId !== expected.documentId || embedded.revision !== expected.revision) {
    throw new Error("Exported HTML snapshot identity does not match the current document.");
  }

  if ((embedded.nodes?.length ?? 0) !== (expected.nodes?.length ?? 0)) {
    throw new Error("Exported HTML snapshot node count does not match the current document.");
  }

  if ((embedded.drawings?.length ?? 0) !== (expected.drawings?.length ?? 0)) {
    throw new Error("Exported HTML snapshot drawing count does not match the current document.");
  }

  return true;
}
