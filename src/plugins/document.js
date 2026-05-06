import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";
import {
  exportDocumentSnapshot,
  importDocumentSnapshot,
} from "../document/serializer.js";
import { normalizeDocumentSnapshot, stringifyDocumentSnapshot } from "../document/schema.js";
import {
  buildRuntimeExportHtml,
  readEmbeddedSnapshotFromHtmlText,
  validateEmbeddedSnapshotInHtml,
} from "../document/runtimeHtmlExport.js";
import { getDocumentExportFormat, resolveRuntimeHtmlTemplate } from "./documentExportMode.js";

const EXPORT_FORMATS = new Set(["html", "json"]);

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function createDocumentId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `document-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function sanitizeFilenamePart(value, fallback = "mind-map") {
  if (typeof value !== "string") return fallback;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function downloadTextFile(filename, text, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

const LOAD_CONFIRM_MESSAGE =
  "Loading a document will replace the current board content. Continue?";

class ExportDocumentCommand extends BaseCommand {
  static commandId = "document:export";
  static label = "Export Document";

  execute(options = {}) {
    const format = typeof options?.format === "string" ? options.format : undefined;
    if (!format) {
      this.plugin.openExportMenu();
      return null;
    }
    return this.plugin.exportDocument({ download: true, format });
  }
}

class ImportDocumentCommand extends BaseCommand {
  static commandId = "document:import";
  static label = "Import Document";

  execute() {
    return this.plugin.openFilePicker();
  }
}

export class DocumentPlugin extends BasePlugin {
  static pluginId = "document";

  commands() {
    return [ExportDocumentCommand, ImportDocumentCommand];
  }

  onSetup() {
    const {
      documentControlsEl = null,
      exportEl = null,
      importEl = null,
      importInputEl = null,
    } = this.options;

    this.ui = {
      documentControlsEl,
      exportEl,
      importEl,
      importInputEl,
    };
    this.app.documentManager = this;
    this.documentState = this.createDocumentState();
    this.statusTimeout = null;
    this.isDevMode = Boolean(import.meta.env?.DEV);
    this.isStandaloneSingleFile = Boolean(__SINGLE_FILE_EXPORT__);
    this.buildStatusToast();
    this.buildExportMenu();

    if (documentControlsEl) {
      renderIcons(documentControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }

    if (exportEl) {
      renderIcons(exportEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
      this.listenDom(exportEl, "click", (event) => {
        event.preventDefault();
        this.toggleExportMenu();
      });
      exportEl.title = "Save document (choose HTML or JSON)";
      exportEl.setAttribute("aria-label", "Save document (choose HTML or JSON)");
    }

    if (importEl) {
      renderIcons(importEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
      this.listenDom(importEl, "click", () => {
        this.openFilePicker();
      });
      importEl.title = "Load document";
      importEl.setAttribute("aria-label", "Load document");
    }

    if (importInputEl) {
      this.listenDom(importInputEl, "change", () => {
        void this.handleImportInputChange();
      });
    }

    this.app.keybindings.register("Mod+S", "document:export");
    this.app.keybindings.register("Mod+O", "document:import");
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+S"));
    this.cleanups.push(() => this.app.keybindings.unregister("Mod+O"));
    this.cleanups.push(() => {
      window.clearTimeout(this.statusTimeout);
      this.statusEl?.remove();
      this.exportMenuEl?.remove();
      if (this.app.documentManager === this) {
        this.app.documentManager = null;
      }
    });
  }

  buildExportMenu() {
    const exportEl = this.ui?.exportEl;
    if (!exportEl) return;

    const menu = document.createElement("div");
    menu.className = "document-export-menu";
    menu.hidden = true;
    menu.dataset.testid = "save-document-format-menu";
    menu.setAttribute("role", "menu");

    const htmlBtn = document.createElement("button");
    htmlBtn.type = "button";
    htmlBtn.className = "document-export-menu__item";
    htmlBtn.dataset.testid = "save-document-as-html";
    htmlBtn.setAttribute("role", "menuitem");
    htmlBtn.textContent = "Save as HTML";

    const jsonBtn = document.createElement("button");
    jsonBtn.type = "button";
    jsonBtn.className = "document-export-menu__item";
    jsonBtn.dataset.testid = "save-document-as-json";
    jsonBtn.setAttribute("role", "menuitem");
    jsonBtn.textContent = "Save as JSON";

    menu.append(htmlBtn, jsonBtn);
    document.body.append(menu);
    this.exportMenuEl = menu;

    this.listenDom(htmlBtn, "click", () => {
      this.closeExportMenu();
      void this.app.commands.execute("document:export", { format: "html" });
    });

    this.listenDom(jsonBtn, "click", () => {
      this.closeExportMenu();
      void this.app.commands.execute("document:export", { format: "json" });
    });

    this.listenDom(window, "pointerdown", (event) => {
      if (menu.hidden) return;
      if (exportEl.contains(event.target)) return;
      if (menu.contains(event.target)) return;
      this.closeExportMenu();
    }, true);

    this.listenDom(document, "keydown", (event) => {
      if (event.key === "Escape") {
        this.closeExportMenu();
      }
    });

    this.listenDom(window, "blur", () => {
      this.closeExportMenu();
    });
  }

  positionExportMenu() {
    const exportEl = this.ui?.exportEl;
    const menu = this.exportMenuEl;
    if (!exportEl || !menu) return;
    const rect = exportEl.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gutter = 8;
    const rightPreferred = rect.right + 6;
    const leftFallback = rect.left - menuRect.width - 6;
    const maxLeft = window.innerWidth - menuRect.width - gutter;
    let left = rightPreferred;

    if (left + menuRect.width > window.innerWidth - gutter) {
      left = leftFallback;
    }

    left = Math.max(gutter, Math.min(left, maxLeft));
    const maxTop = window.innerHeight - menuRect.height - gutter;
    const top = Math.max(gutter, Math.min(Math.max(gutter, rect.top), maxTop));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  openExportMenu() {
    if (!this.exportMenuEl) return;
    this.exportMenuEl.hidden = false;
    this.positionExportMenu();
  }

  closeExportMenu() {
    if (!this.exportMenuEl) return;
    this.exportMenuEl.hidden = true;
  }

  toggleExportMenu() {
    if (!this.exportMenuEl) return;
    if (this.exportMenuEl.hidden) {
      this.openExportMenu();
      return;
    }
    this.closeExportMenu();
  }

  createDocumentState(overrides = {}) {
    return {
      documentId:
        typeof overrides.documentId === "string" && overrides.documentId
          ? overrides.documentId
          : createDocumentId(),
      revision: Number.isFinite(overrides.revision) ? overrides.revision : 0,
      title:
        typeof overrides.title === "string" && overrides.title.trim()
          ? overrides.title.trim()
          : "Untitled",
    };
  }

  getDocumentState() {
    return clonePlainData(this.documentState);
  }

  hasCurrentContent() {
    return (
      this.app.mainLayer.find(".selectable").length > 0 ||
      this.app.drawLayer.find(".drawable").length > 0
    );
  }

  buildStatusToast() {
    this.statusEl = document.createElement("div");
    this.statusEl.className = "document-toast";
    this.statusEl.hidden = true;
    this.statusEl.dataset.testid = "document-status-toast";
    document.body.append(this.statusEl);
  }

  showStatus(message, tone = "info") {
    if (!this.statusEl) return;

    window.clearTimeout(this.statusTimeout);
    this.statusEl.textContent = message;
    this.statusEl.hidden = false;
    this.statusEl.classList.toggle("document-toast--error", tone === "error");
    this.statusEl.classList.add("is-visible");

    this.statusTimeout = window.setTimeout(() => {
      this.statusEl?.classList.remove("is-visible");
    }, 1800);
  }

  getSuggestedFilename() {
    const titlePart = sanitizeFilenamePart(this.documentState.title, "mind-map");
    return `${titlePart}-r${this.documentState.revision || 0}`;
  }

  serializeDocument() {
    const nextRevision = this.documentState.revision + 1;
    const snapshot = exportDocumentSnapshot(this.app, {
      documentId: this.documentState.documentId,
      revision: nextRevision,
      meta: {
        title: this.documentState.title,
      },
    });

    this.documentState.revision = nextRevision;
    return snapshot;
  }

  getRuntimeHtmlTemplate() {
    if (typeof window === "undefined") return "";
    return resolveRuntimeHtmlTemplate({
      isDevMode: this.isDevMode,
      exportTemplate: window.__APP_EXPORT_TEMPLATE__,
      runtimeTemplate: window.__APP_HTML_TEMPLATE__,
    });
  }

  getFallbackExportFormat() {
    return getDocumentExportFormat({
      isStandaloneSingleFile: this.isStandaloneSingleFile,
      isDevMode: this.isDevMode,
    });
  }

  resolveExportFormat(format) {
    if (typeof format === "string" && EXPORT_FORMATS.has(format)) {
      return format;
    }
    return this.getFallbackExportFormat();
  }

  exportDocument({ download = false, format } = {}) {
    const snapshot = this.serializeDocument();
    const exportFormat = this.resolveExportFormat(format);
    const suggestedBase = this.getSuggestedFilename();

    if (download) {
      if (exportFormat === "html") {
        const template = this.getRuntimeHtmlTemplate();
        if (!template) {
          if (this.isDevMode) {
            throw new Error(
              "Dev HTML export template is unavailable. Run `pnpm export:html` (or start with `pnpm dev`) and reload.",
            );
          }
          throw new Error("Runtime HTML template is unavailable.");
        }

        const html = buildRuntimeExportHtml(template, snapshot, {
          title: this.documentState.title,
        });
        validateEmbeddedSnapshotInHtml(html, snapshot);
        downloadTextFile(`${suggestedBase}.html`, html, "text/html");
        this.showStatus("HTML saved");
      } else {
        downloadTextFile(
          `${suggestedBase}.json`,
          stringifyDocumentSnapshot(snapshot),
        );
        this.showStatus("Document saved");
      }
    }

    this.app.events.emit("document:exported", {
      document: clonePlainData(snapshot),
      format: exportFormat,
    });
    return snapshot;
  }

  openFilePicker() {
    const { importInputEl } = this.ui;
    if (!importInputEl) return false;

    importInputEl.value = "";
    importInputEl.click();
    return true;
  }

  async handleImportInputChange() {
    const file = this.ui.importInputEl?.files?.[0];
    if (!file) return false;

    try {
      if (this.hasCurrentContent() && !window.confirm(LOAD_CONFIRM_MESSAGE)) {
        return false;
      }

      const text = await file.text();
      const result = await this.importDocumentFromText(text, { source: "file" });
      this.showStatus(result.format === "html" ? "HTML loaded" : "JSON loaded");
      return true;
    } catch (error) {
      console.error(error);
      this.showStatus(error instanceof Error ? error.message : "Failed to load document.", "error");
      return false;
    } finally {
      if (this.ui.importInputEl) {
        this.ui.importInputEl.value = "";
      }
    }
  }

  async importDocumentFromText(text, options = {}) {
    let parsed = null;
    let format = "json";
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = readEmbeddedSnapshotFromHtmlText(text);
      if (!parsed) {
        throw new Error("Document file must be JSON or HTML containing #app-snapshot.");
      }
      format = "html";
    }

    const document = await this.loadDocument(parsed, options);
    return { document, format };
  }

  async loadDocument(snapshot, { source = "api" } = {}) {
    const normalized = normalizeDocumentSnapshot(snapshot);

    this.app.events.emit("document:load:start", {
      source,
      document: clonePlainData(normalized),
    });

    this.app.isRestoringDocument = true;

    try {
      const imported = await importDocumentSnapshot(this.app, normalized);
      this.documentState = this.createDocumentState({
        documentId: imported.documentId,
        revision: imported.revision,
        title: imported.meta.title,
      });
      this.app.history?.resetHistory?.();
      this.app.events.emit("document:load:end", {
        source,
        document: clonePlainData(imported),
      });
      return imported;
    } catch (error) {
      this.app.events.emit("document:load:error", {
        source,
        error,
      });
      throw error;
    } finally {
      this.app.isRestoringDocument = false;
    }
  }
}
