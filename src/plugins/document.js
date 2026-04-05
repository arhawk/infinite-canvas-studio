import { BaseCommand, BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";
import {
  exportDocumentSnapshot,
  importDocumentSnapshot,
} from "../document/serializer.js";
import { normalizeDocumentSnapshot, stringifyDocumentSnapshot } from "../document/schema.js";
import { buildRuntimeExportHtml } from "../document/runtimeHtmlExport.js";

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

  execute() {
    return this.plugin.exportDocument({ download: true });
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
    this.isStandaloneSingleFile = Boolean(__SINGLE_FILE_EXPORT__);
    this.buildStatusToast();

    if (documentControlsEl) {
      renderIcons(documentControlsEl, {
        width: 16,
        height: 16,
        "stroke-width": 2,
      });
    }

    if (exportEl) {
      this.listenDom(exportEl, "click", () => {
        void this.app.commands.execute("document:export");
      });
      exportEl.title = this.isStandaloneSingleFile ? "Save HTML (Mod+S)" : "Save JSON (Mod+S)";
      exportEl.setAttribute(
        "aria-label",
        this.isStandaloneSingleFile ? "Save document as HTML" : "Save document as JSON",
      );
    }

    if (importEl) {
      this.listenDom(importEl, "click", () => {
        this.openFilePicker();
      });
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
      if (this.app.documentManager === this) {
        this.app.documentManager = null;
      }
    });
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
    return typeof window !== "undefined" ? window.__APP_HTML_TEMPLATE__ ?? "" : "";
  }

  getExportFormat() {
    return this.isStandaloneSingleFile ? "html" : "json";
  }

  exportDocument({ download = false } = {}) {
    const snapshot = this.serializeDocument();
    const exportFormat = this.getExportFormat();
    const suggestedBase = this.getSuggestedFilename();

    if (download) {
      if (exportFormat === "html") {
        const template = this.getRuntimeHtmlTemplate();
        if (!template) {
          throw new Error("Runtime HTML template is unavailable.");
        }

        const html = buildRuntimeExportHtml(template, snapshot, {
          title: this.documentState.title,
        });
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
      await this.importDocumentFromText(text, { source: "file" });
      this.showStatus("Document loaded");
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
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Document file is not valid JSON.");
    }

    return this.loadDocument(parsed, options);
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
