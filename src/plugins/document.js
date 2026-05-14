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
  validateRuntimeExportTemplate,
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

  async execute(options = {}) {
    const format = typeof options?.format === "string" ? options.format : undefined;
    if (!format) {
      this.plugin.openExportMenu();
      return null;
    }
    try {
      return await this.plugin.exportDocument({ download: true, format });
    } catch (error) {
      console.error(error);
      this.plugin.showStatus(
        error instanceof Error ? error.message : "Failed to export document.",
        "error",
      );
      return null;
    }
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
      titleEl = null,
    } = this.options;

    this.ui = {
      documentControlsEl,
      exportEl,
      importEl,
      importInputEl,
      titleEl,
    };
    this.app.documentManager = this;
    this.documentState = this.createDocumentState();
    this.statusTimeout = null;
    this.isDevMode = Boolean(import.meta.env?.DEV);
    this.isExportTemplateBuild = Boolean(__EXPORT_TEMPLATE_BUILD__);
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
      exportEl.dataset.tooltip = "Save document (Mod+S)";
      exportEl.setAttribute("aria-label", "Save document (Mod+S)");
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
      importEl.dataset.tooltip = "Load document (Mod+O)";
      importEl.setAttribute("aria-label", "Load document (Mod+O)");
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
      this.loadingOverlayEl?.remove();
      this.exportMenuEl?.remove();
      if (this.app.documentManager === this) {
        this.app.documentManager = null;
      }
    });

    if (titleEl) {
      this._setupTitleRename();
    }
  }

  _setupTitleRename() {
    const titleEl = this.ui.titleEl;
    if (!titleEl) return;

    titleEl.textContent = this.documentState.title;
    titleEl.title = "Double-click to rename";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "toolbar__title-input";
    input.setAttribute("aria-label", "Document title");
    input.dataset.testid = "title-rename-input";
    input.hidden = true;
    titleEl.insertAdjacentElement("afterend", input);
    this._titleInput = input;
    this._titleEditing = false;
    this._titleInputCleanup = null;

    this.listenDom(titleEl, "dblclick", () => this._openTitleEditor());

    this.listen("document:load:end", () => {
      if (!this._titleEditing) {
        titleEl.textContent = this.documentState.title;
      }
    });

    this.cleanups.push(() => {
      input.remove();
    });
  }

  _openTitleEditor() {
    if (this._titleEditing) return;
    const titleEl = this.ui.titleEl;
    const input = this._titleInput;
    if (!titleEl || !input) return;

    this._titleEditing = true;
    const currentTitle = this.documentState.title;
    input.value = currentTitle;
    titleEl.hidden = true;
    input.hidden = false;

    const syncSize = () => {
      input.size = Math.max(input.value.length + 2, 6);
    };
    syncSize();
    input.addEventListener("input", syncSize);

    input.focus();
    input.select();

    let settled = false;

    const commit = () => {
      if (settled) return;
      settled = true;
      const next = input.value.trim() || "Untitled";
      this._closeTitleEditor(next);
    };

    const cancel = () => {
      if (settled) return;
      settled = true;
      this._closeTitleEditor(null);
    };

    const onKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };

    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("blur", commit, { once: true });

    this._titleInputCleanup = () => {
      input.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("input", syncSize);
    };
  }

  _closeTitleEditor(newTitle) {
    this._titleEditing = false;
    const titleEl = this.ui.titleEl;
    const input = this._titleInput;
    if (!titleEl || !input) return;

    if (this._titleInputCleanup) {
      this._titleInputCleanup();
      this._titleInputCleanup = null;
    }

    if (newTitle !== null) {
      this.documentState.title = newTitle;
      titleEl.textContent = newTitle;
    }

    input.hidden = true;
    titleEl.hidden = false;
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
      exportTemplate: window.__APP_EXPORT_TEMPLATE__,
    });
  }

  async ensureRuntimeHtmlTemplate() {
    const existing = this.getRuntimeHtmlTemplate();
    if (existing) return validateRuntimeExportTemplate(existing);
    if (typeof window === "undefined") return "";

    const response = await fetch("/__export-template", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `HTML export template is unavailable (HTTP ${response.status}). Please ensure /__export-template is accessible.`,
      );
    }

    const template = await response.text();
    const validated = validateRuntimeExportTemplate(template);

    window.__APP_EXPORT_TEMPLATE__ = validated;
    window.__APP_EXPORT_TEMPLATE_READY__ = true;
    return validated;
  }

  getFallbackExportFormat() {
    return getDocumentExportFormat({
      isExportTemplateBuild: this.isExportTemplateBuild,
      isDevMode: this.isDevMode,
    });
  }

  resolveExportFormat(format) {
    if (typeof format === "string" && EXPORT_FORMATS.has(format)) {
      return format;
    }
    return this.getFallbackExportFormat();
  }

  async exportDocument({ download = false, format } = {}) {
    const snapshot = this.serializeDocument();
    const exportFormat = this.resolveExportFormat(format);
    const suggestedBase = this.getSuggestedFilename();

    if (download) {
      if (exportFormat === "html") {
        const template = await this.ensureRuntimeHtmlTemplate();

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

  async loadDocument(snapshot, { source = "api", loadingLayer = null } = {}) {
    const normalized = normalizeDocumentSnapshot(snapshot);
    const activeLoadingLayer = loadingLayer ?? this.showDocumentLoadingLayer({
      label: "Loading document...",
      total: normalized.nodes.length,
    });
    activeLoadingLayer.update?.({
      completed: 0,
      total: normalized.nodes.length,
      remaining: normalized.nodes.length,
      label: "Loading document...",
    });
    await this.waitForDocumentLoadingLayerPaint();

    this.app.events.emit("document:load:start", {
      source,
      document: clonePlainData(normalized),
    });

    this.app.isRestoringDocument = true;

    try {
      let lastProgressPaint = 0;
      const imported = await importDocumentSnapshot(this.app, normalized, {
        onProgress: async (progress) => {
          activeLoadingLayer.update(progress);
          const shouldPaint =
            progress.completed === progress.total ||
            progress.completed - lastProgressPaint >= 12;
          if (shouldPaint) {
            lastProgressPaint = progress.completed;
            await this.waitForDocumentLoadingLayerPaint({ frames: 1 });
          }
        },
      });
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
      activeLoadingLayer.hide();
    }
  }

  showDocumentLoadingLayer({ label = "Loading document...", total = 0 } = {}) {
    if (typeof document === "undefined") {
      return {
        update: () => {},
        hide: () => {},
      };
    }

    if (!this.loadingOverlayEl) {
      const overlay = document.createElement("div");
      overlay.className = "document-loading-layer";
      overlay.dataset.testid = "document-loading-layer";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = `
        <div class="document-loading-layer__panel">
          <div class="document-loading-layer__spinner" aria-hidden="true"></div>
          <div class="document-loading-layer__content">
            <div class="document-loading-layer__text">Loading document...</div>
            <div
              class="document-loading-layer__progress"
              role="progressbar"
              aria-label="Document loading progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
            >
              <div class="document-loading-layer__progress-bar"></div>
            </div>
            <div class="document-loading-layer__meta">Preparing components...</div>
          </div>
        </div>
      `;
      this.loadingOverlayEl = overlay;
    }

    if (!this.loadingOverlayEl.isConnected) {
      document.body.append(this.loadingOverlayEl);
    }

    const depth = Number(document.body.dataset.documentLoadingDepth ?? 0) + 1;
    document.body.dataset.documentLoadingDepth = String(depth);
    document.body.setAttribute("aria-busy", "true");
    this.loadingOverlayEl.hidden = false;
    this.updateDocumentLoadingLayer({ completed: 0, total, remaining: total, label });

    return {
      update: (progress) => this.updateDocumentLoadingLayer(progress),
      hide: () => {
        const nextDepth = Math.max(0, Number(document.body.dataset.documentLoadingDepth ?? 1) - 1);
        if (nextDepth > 0) {
          document.body.dataset.documentLoadingDepth = String(nextDepth);
          return;
        }

        delete document.body.dataset.documentLoadingDepth;
        document.body.removeAttribute("aria-busy");
        if (this.loadingOverlayEl) {
          this.updateDocumentLoadingLayer({
            completed: total,
            total,
            remaining: 0,
          });
          this.loadingOverlayEl.hidden = true;
        }
      },
    };
  }

  updateDocumentLoadingLayer({
    completed = 0,
    total = 0,
    remaining = null,
    label = null,
  } = {}) {
    const overlay = this.loadingOverlayEl;
    if (!overlay) return;

    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCompleted = Math.min(safeTotal, Math.max(0, Number(completed) || 0));
    const safeRemaining = Number.isFinite(remaining)
      ? Math.max(0, Number(remaining))
      : Math.max(0, safeTotal - safeCompleted);
    const percent = safeTotal > 0 ? Math.round((safeCompleted / safeTotal) * 100) : 0;

    const progressEl = overlay.querySelector(".document-loading-layer__progress");
    const barEl = overlay.querySelector(".document-loading-layer__progress-bar");
    const textEl = overlay.querySelector(".document-loading-layer__text");
    const metaEl = overlay.querySelector(".document-loading-layer__meta");

    if (textEl && typeof label === "string") {
      textEl.textContent = label;
    }

    if (progressEl) {
      progressEl.setAttribute("aria-valuenow", String(percent));
    }

    if (barEl) {
      barEl.style.transform = `scaleX(${percent / 100})`;
    }

    if (metaEl) {
      metaEl.textContent = safeTotal > 0
        ? `${safeCompleted} / ${safeTotal} components loaded, ${safeRemaining} remaining`
        : "Preparing document...";
    }
  }

  waitForDocumentLoadingLayerPaint({ frames = 2 } = {}) {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let remainingFrames = Math.max(1, Math.trunc(frames));
      const step = () => {
        remainingFrames -= 1;
        if (remainingFrames <= 0) {
          window.setTimeout(resolve, 0);
          return;
        }
        window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    });
  }
}
