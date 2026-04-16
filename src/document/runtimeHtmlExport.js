import { normalizeDocumentSnapshot, stringifyDocumentSnapshot } from "./schema.js";

const SNAPSHOT_SCRIPT_ID = "app-snapshot";

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
    /\s*<div\b[^>]*\bid=["']document-controls["'][^>]*>[\s\S]*?<\/div>(?=\s*<div\b[^>]*\bid=["']arrange-controls["'])/i,
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

export function buildRuntimeExportHtml(template, snapshot, { title = "Mind Map Infinite Canvas" } = {}) {
  if (typeof template !== "string" || !template.trim()) {
    throw new Error("HTML export template is missing.");
  }

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
    html = html.replace(
      /<\/body>/i,
      `  <script id="${SNAPSHOT_SCRIPT_ID}" type="application/json">${snapshotJson}</script>\n</body>`,
    );
  }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  return html;
}
