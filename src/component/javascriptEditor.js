import { BaseComponent } from "../core/baseClasses.js";
import { createOverlayNodeDragBridge } from "./overlayInteraction.js";
import {
  applyOverlayOcclusionStyles as applySharedOverlayOcclusionStyles,
  getOverlayOcclusionRects as getSharedOverlayOcclusionRects,
} from "./overlayOcclusion.js";
import { DISPLAY_FONT_FAMILY, UI_FONT_FAMILY } from "../lib/fonts.js";
import { Konva } from "../lib/konva.js";
import { getCanvasTheme } from "../theme/canvasTheme.js";

const DEFAULT_WIDTH = 544;
const DEFAULT_HEIGHT = 420;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const DEFAULT_TITLE = "JS Code Runner";
const DEFAULT_CODE = [
  "// Write JavaScript here, press Run or Ctrl+Enter to execute.",
  "",
  'root.innerHTML = "<h2>Hello World</h2>";',
  'console.log("Hello World");',
].join("\n");
const DEFAULT_OUTPUT_RATIO = 0.34;
const MIN_OUTPUT_RATIO = 0.22;
const MAX_OUTPUT_RATIO = 0.65;
const MIN_EDITOR_PANE_HEIGHT = 120;
const MIN_OUTPUT_PANE_HEIGHT = 96;
const EDIT_COMMIT_DELAY = 600;
const MONACO_VERSION = "0.52.2";
const MONACO_BASE_URL = `https://unpkg.com/monaco-editor@${MONACO_VERSION}/min/vs`;
const MONACO_LOADER_URL = `${MONACO_BASE_URL}/loader.js`;
const STATIC_HEADER_HEIGHT = 42;
const STATIC_BODY_TOP = 54;
const STATIC_BODY_INSET_X = 14;
const STATIC_BODY_BOTTOM = 12;
const STATIC_SPLITTER_HEIGHT = 12;

let monacoRuntimePromise = null;

function normalizeDimension(value, fallback, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function normalizeTitle(value) {
  const nextValue = String(value ?? "").trim();
  return nextValue || DEFAULT_TITLE;
}

function normalizeCode(value) {
  if (value == null) return DEFAULT_CODE;
  return String(value);
}

function normalizeOutputRatio(value) {
  if (!Number.isFinite(value)) return DEFAULT_OUTPUT_RATIO;
  return Math.max(MIN_OUTPUT_RATIO, Math.min(MAX_OUTPUT_RATIO, value));
}

function escapeScriptCloseTag(value) {
  return String(value ?? "").replace(/<\/script/gi, "<\\/script");
}

function clampOutputHeight(availableHeight, nextHeight) {
  const safeAvailableHeight = Math.max(0, availableHeight);
  const minOutputHeight = Math.min(MIN_OUTPUT_PANE_HEIGHT, safeAvailableHeight);
  const maxOutputHeight = Math.max(
    minOutputHeight,
    safeAvailableHeight - MIN_EDITOR_PANE_HEIGHT,
  );

  return Math.max(minOutputHeight, Math.min(maxOutputHeight, nextHeight));
}

function getPaneHeights(totalHeight, splitterHeight, ratio) {
  const availableHeight = Math.max(0, totalHeight - splitterHeight);
  const outputHeight = clampOutputHeight(
    availableHeight,
    availableHeight * normalizeOutputRatio(ratio),
  );

  return {
    editorHeight: Math.max(0, availableHeight - outputHeight),
    outputHeight,
  };
}

function getOutputRatioForHeight(availableHeight, outputHeight) {
  const safeAvailableHeight = Math.max(1, availableHeight);
  return normalizeOutputRatio(
    clampOutputHeight(safeAvailableHeight, outputHeight) / safeAvailableHeight,
  );
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function buildPreviewBridgeScript(nodeId, runRevision = 0) {
  const serializedNodeId = JSON.stringify(String(nodeId ?? ""));
  const serializedRunRevision = Number.isFinite(runRevision) ? runRevision : 0;

  return `<script>
      (function () {
        const NODE_ID = ${serializedNodeId};
        const RUN_REVISION = ${serializedRunRevision};

        function notify(type, payload) {
          try {
            parent.postMessage(
              {
                source: "javascript-editor-component",
                nodeId: NODE_ID,
                runRevision: RUN_REVISION,
                type,
                payload,
              },
              "*",
            );
          } catch {}
        }

        document.addEventListener(
          "mousedown",
          (event) => {
            notify("preview:pointerdown", {
              button: event.button ?? 0,
            });
          },
          true,
        );

        document.addEventListener(
          "contextmenu",
          (event) => {
            event.preventDefault();
            notify("contextmenu", {
              x: event.clientX ?? 0,
              y: event.clientY ?? 0,
            });
          },
          true,
        );

        window.__javascriptEditorNotify = notify;
      })();
    <\/script>`;
}

function buildEmptyPreviewDocument(nodeId, runRevision = 0) {
  const theme = getCanvasTheme().javascriptEditor;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light;
        font-family: ${UI_FONT_FAMILY};
      }
      html,
      body {
        height: 100%;
      }
      body {
        margin: 0;
        min-height: 0;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        padding: 12px;
        overflow: hidden;
        background: ${theme.previewBackground};
        color: ${theme.previewTextColor};
        text-align: center;
      }
      p {
        margin: 0;
        max-width: none;
        font-size: 12px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>
  </head>
  <body>
    <p>Press Run to preview your code.</p>
    ${buildPreviewBridgeScript(nodeId, runRevision)}
  </body>
</html>`;
}

function buildRuntimeDocument({ code, nodeId, runRevision = 0 }) {
  const theme = getCanvasTheme().javascriptEditor;
  const serializedCode = JSON.stringify(escapeScriptCloseTag(String(code ?? "")));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        font-family: ${UI_FONT_FAMILY};
      }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 14px 16px;
        box-sizing: border-box;
        background: ${theme.runtimeBackground};
        color: ${theme.runtimeTextColor};
      }
      #app {
        min-height: 0;
      }
      #app > :first-child {
        margin-top: 0;
      }
      .javascript-editor-runtime__error {
        margin: 16px 0 0;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(167, 71, 62, 0.18);
        background: rgba(255, 239, 236, 0.96);
        color: #8f241d;
        font: 12px/1.5 "Courier New", monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    ${buildPreviewBridgeScript(nodeId, runRevision)}
    <script>
      (function () {
        const USER_CODE = ${serializedCode};
        const notify = window.__javascriptEditorNotify ?? (() => {});
        const previewRoot = document.getElementById("app");
        window.root = previewRoot;
        window.app = previewRoot;

        function stringifyArg(value) {
          if (typeof value === "string") return value;
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        }

        function renderRuntimeError(message) {
          const errorNode = document.createElement("pre");
          errorNode.className = "javascript-editor-runtime__error";
          errorNode.textContent = message;
          document.body.append(errorNode);
        }

        ["log", "info", "warn", "error"].forEach((level) => {
          const original = console[level]?.bind(console);
          console[level] = (...args) => {
            notify("console", {
              level,
              text: args.map((value) => stringifyArg(value)).join(" "),
            });
            original?.(...args);
          };
        });

        window.addEventListener("error", (event) => {
          const message = event.error?.stack || event.message || "Unknown runtime error";
          notify("runtime-error", { message });
          renderRuntimeError(message);
          event.preventDefault();
        });

        window.addEventListener("unhandledrejection", (event) => {
          const message = event.reason?.stack || String(event.reason ?? "Unhandled rejection");
          notify("runtime-error", { message });
          renderRuntimeError(message);
          event.preventDefault?.();
        });

        try {
          const runUserCode = new Function(USER_CODE);
          runUserCode();
          notify("run:complete", { ok: true });
        } catch (error) {
          const message = error?.stack || String(error);
          notify("runtime-error", { message });
          renderRuntimeError(message);
        }
      })();
    <\/script>
  </body>
</html>`;
}

function syncChrome(node, data = {}) {
  const width = normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const title = normalizeTitle(data.title);

  const background = node.findOne(".javascript-editor-bg");
  const divider = node.findOne(".javascript-editor-divider");
  const titleNode = node.findOne(".javascript-editor-title");
  const editorPanel = node.findOne(".javascript-editor-static-editor");
  const outputPanel = node.findOne(".javascript-editor-static-output");
  const splitter = node.findOne(".javascript-editor-static-splitter");
  const tabPill = node.findOne(".javascript-editor-static-tab");
  const outputHint = node.findOne(".javascript-editor-static-output-hint");

  node.width(width);
  node.height(height);

  if (background) {
    background.width(width);
    background.height(height);
  }

  if (divider) {
    divider.points([0, STATIC_HEADER_HEIGHT, width, STATIC_HEADER_HEIGHT]);
  }

  if (titleNode) {
    titleNode.x(28);
    titleNode.width(Math.max(0, width - 56));
    titleNode.text(title);
  }

  const panelX = STATIC_BODY_INSET_X;
  const panelWidth = Math.max(0, width - STATIC_BODY_INSET_X * 2);
  const contentHeight = Math.max(0, height - STATIC_BODY_TOP - STATIC_BODY_BOTTOM);
  const { editorHeight, outputHeight } = getPaneHeights(
    contentHeight,
    STATIC_SPLITTER_HEIGHT,
    node.getAttr("javascriptEditorOutputRatio") ?? data.outputRatio ?? DEFAULT_OUTPUT_RATIO,
  );
  const editorY = STATIC_BODY_TOP;
  const splitterY = editorY + editorHeight + STATIC_SPLITTER_HEIGHT / 2 - 2;
  const outputY = editorY + editorHeight + STATIC_SPLITTER_HEIGHT;

  if (editorPanel) {
    editorPanel.setAttrs({
      x: panelX,
      y: editorY,
      width: panelWidth,
      height: editorHeight,
    });
  }

  if (splitter) {
    splitter.setAttrs({
      x: Math.max(panelX, width / 2 - 28),
      y: splitterY,
    });
  }

  if (outputPanel) {
    outputPanel.setAttrs({
      x: panelX,
      y: outputY,
      width: panelWidth,
      height: outputHeight,
    });
  }

  if (tabPill) {
    tabPill.setAttrs({
      x: panelX + 10,
      y: outputY + 11,
    });
  }

  if (outputHint) {
    outputHint.setAttrs({
      x: panelX + 18,
      y: outputY + Math.max(42, outputHeight / 2 - 7),
      width: Math.max(0, panelWidth - 36),
    });
  }

  const codeLines = node.find?.(".javascript-editor-static-code-line") ?? [];
  codeLines.forEach((line, index) => {
    const lineWidths = [0.72, 0.38, 0.58, 0.46];
    line.setAttrs({
      x: panelX + 44,
      y: editorY + 22 + index * 18,
      points: [0, 0, panelWidth * (lineWidths[index] ?? 0.5), 0],
    });
  });

  const lineNumbers = node.find?.(".javascript-editor-static-line-number") ?? [];
  lineNumbers.forEach((lineNumber, index) => {
    lineNumber.setAttrs({
      x: panelX + 18,
      y: editorY + 14 + index * 18,
    });
  });

  const codeCursor = node.findOne(".javascript-editor-static-code-cursor");
  if (codeCursor) {
    codeCursor.points([
      panelX + 44,
      editorY + 24,
      panelX + 44,
      editorY + Math.max(24, Math.min(editorHeight - 18, 86)),
    ]);
  }
}

function loadMonacoRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }

  if (window.monaco?.editor) {
    return Promise.resolve(window.monaco);
  }

  if (monacoRuntimePromise) {
    return monacoRuntimePromise;
  }

  monacoRuntimePromise = new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      resolve(value ?? null);
    };

    const bootMonaco = () => {
      if (!window.require?.config || typeof window.require !== "function") {
        finish(null);
        return;
      }

      window.require.config({
        paths: {
          vs: MONACO_BASE_URL,
        },
      });

      window.require(
        ["vs/editor/editor.main"],
        () => finish(window.monaco ?? null),
        () => finish(null),
      );
    };

    timeoutId = window.setTimeout(() => finish(null), 5000);
    const finalize = (value) => {
      finish(value);
    };

    if (window.require?.config && typeof window.require === "function") {
      bootMonaco();
      return;
    }

    const existingLoader = document.querySelector(`script[data-monaco-loader="${MONACO_VERSION}"]`);
    if (existingLoader) {
      existingLoader.addEventListener("load", bootMonaco, { once: true });
      existingLoader.addEventListener("error", () => finalize(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = MONACO_LOADER_URL;
    script.async = true;
    script.dataset.monacoLoader = MONACO_VERSION;
    script.addEventListener("load", bootMonaco, { once: true });
    script.addEventListener("error", () => finalize(null), { once: true });
    document.head.append(script);
  }).then((result) => {
    if (!result) {
      monacoRuntimePromise = Promise.resolve(null);
    }
    return result;
  });

  return monacoRuntimePromise;
}

export class JavaScriptEditorComponent extends BaseComponent {
  static type = "javascriptEditor";
  static label = "JS Code Runner";
  static description = "Write JavaScript and run it in an isolated preview";

  renderPalettePreview(previewEl) {
    const shell = document.createElement("div");
    shell.className = "javascript-editor-component__palette";

    const top = document.createElement("div");
    top.className = "javascript-editor-component__palette-top";

    const dot = document.createElement("span");
    dot.className = "javascript-editor-component__palette-dot";

    const title = document.createElement("span");
    title.className = "javascript-editor-component__palette-title";
    title.textContent = "JS";

    top.append(dot, title);

    const code = document.createElement("div");
    code.className = "javascript-editor-component__palette-code";
    code.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    `;

    const preview = document.createElement("div");
    preview.className = "javascript-editor-component__palette-preview";
    preview.innerHTML = "<i></i><i></i>";

    shell.append(top, code, preview);
    previewEl.append(shell);
  }

  async createNode({
    x,
    y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    title = DEFAULT_TITLE,
    code = DEFAULT_CODE,
    outputRatio = DEFAULT_OUTPUT_RATIO,
  } = {}) {
    const theme = getCanvasTheme().javascriptEditor;
    const resolvedWidth = normalizeDimension(width, DEFAULT_WIDTH, MIN_WIDTH);
    const resolvedHeight = normalizeDimension(height, DEFAULT_HEIGHT, MIN_HEIGHT);
    const group = new Konva.Group({
      x,
      y,
      width: resolvedWidth,
      height: resolvedHeight,
      draggable: true,
      name: "javascript-editor-root",
    });

    group.add(
      new Konva.Rect({
        width: resolvedWidth,
        height: resolvedHeight,
        fill: theme.fill,
        stroke: theme.stroke,
        strokeWidth: 1,
        cornerRadius: 20,
        shadowColor: theme.shadowColor,
        shadowBlur: 18,
        shadowOffsetY: 8,
        shadowOpacity: 0.18,
        name: "javascript-editor-bg",
      }),
    );

    group.add(
      new Konva.Line({
        points: [0, STATIC_HEADER_HEIGHT, resolvedWidth, STATIC_HEADER_HEIGHT],
        stroke: theme.dividerStroke,
        strokeWidth: 1,
        listening: false,
        name: "javascript-editor-divider",
      }),
    );

    group.add(
      new Konva.Text({
        x: 28,
        y: 11,
        width: resolvedWidth - 56,
        height: 18,
        text: normalizeTitle(title),
        fontSize: 12,
        fontFamily: DISPLAY_FONT_FAMILY,
        fontStyle: "700",
        letterSpacing: 0.2,
        fill: theme.titleColor,
        name: "javascript-editor-title",
      }),
    );

    group.add(
      new Konva.Rect({
        x: STATIC_BODY_INSET_X,
        y: STATIC_BODY_TOP,
        width: resolvedWidth - STATIC_BODY_INSET_X * 2,
        height: 180,
        fill: theme.editorFill,
        stroke: theme.editorStroke,
        strokeWidth: 1,
        cornerRadius: 14,
        listening: false,
        name: "javascript-editor-static-editor",
      }),
    );

    [1, 2, 3, 4].forEach((lineNumber, index) => {
      group.add(
        new Konva.Text({
          x: STATIC_BODY_INSET_X + 18,
          y: STATIC_BODY_TOP + 14 + index * 18,
          text: String(lineNumber),
          fontSize: 10,
          fontFamily: UI_FONT_FAMILY,
          fill: "#8aa0aa",
          listening: false,
          name: "javascript-editor-static-line-number",
        }),
      );
    });

    group.add(
      new Konva.Line({
        points: [
          STATIC_BODY_INSET_X + 44,
          STATIC_BODY_TOP + 24,
          STATIC_BODY_INSET_X + 44,
          STATIC_BODY_TOP + 92,
        ],
        stroke: theme.cursorStroke,
        strokeWidth: 2,
        listening: false,
        name: "javascript-editor-static-code-cursor",
      }),
    );

    theme.codeLineStrokes.forEach((stroke, index) => {
      group.add(
        new Konva.Line({
          points: [0, 0, 180, 0],
          stroke,
          strokeWidth: 3,
          lineCap: "round",
          listening: false,
          name: "javascript-editor-static-code-line",
        }),
      );
    });

    group.add(
      new Konva.Rect({
        x: resolvedWidth / 2 - 28,
        y: 250,
        width: 56,
        height: 4,
        fill: theme.splitterFill,
        cornerRadius: 999,
        listening: false,
        name: "javascript-editor-static-splitter",
      }),
    );

    group.add(
      new Konva.Rect({
        x: STATIC_BODY_INSET_X,
        y: 270,
        width: resolvedWidth - STATIC_BODY_INSET_X * 2,
        height: 120,
        fill: theme.outputFill,
        stroke: theme.editorStroke,
        strokeWidth: 1,
        cornerRadius: 14,
        listening: false,
        name: "javascript-editor-static-output",
      }),
    );

    group.add(
      new Konva.Rect({
        x: STATIC_BODY_INSET_X + 10,
        y: 282,
        width: 58,
        height: 20,
        fill: theme.tabFill,
        cornerRadius: 999,
        listening: false,
        name: "javascript-editor-static-tab",
      }),
    );

    group.add(
      new Konva.Text({
        x: STATIC_BODY_INSET_X + 18,
        y: 330,
        width: resolvedWidth - STATIC_BODY_INSET_X * 2 - 36,
        text: "Preview output",
        fontSize: 12,
        fontFamily: UI_FONT_FAMILY,
        fill: theme.hintColor,
        align: "center",
        listening: false,
        name: "javascript-editor-static-output-hint",
      }),
    );

    group.setAttr("javascriptEditorTitle", normalizeTitle(title));
    group.setAttr("javascriptEditorCode", normalizeCode(code));
    group.setAttr("javascriptEditorOutputRatio", normalizeOutputRatio(outputRatio));
    syncChrome(group, {
      width: resolvedWidth,
      height: resolvedHeight,
      title,
    });

    group.on("transform.javascriptEditorResize", () => {
      const scaleX = Math.abs(group.scaleX());
      const scaleY = Math.abs(group.scaleY());
      const current = this.serializeNode(group);
      group.scale({ x: 1, y: 1 });
      syncChrome(group, {
        ...current,
        width: current.width * scaleX,
        height: current.height * scaleY,
      });
      this.#syncOverlay(group);
    });

    return group;
  }

  onCreated(node) {
    this.#bindLifecycle(node);

    const handleAdded = ({ node: addedNode }) => {
      if (addedNode !== node) return;
      this.app.off("node:added", handleAdded);
      this.#mountOverlay(node);
    };

    this.app.on("node:added", handleAdded);
  }

  serializeNode(node) {
    return {
      title: node.getAttr("javascriptEditorTitle") ?? DEFAULT_TITLE,
      code: node.getAttr("javascriptEditorCode") ?? DEFAULT_CODE,
      width: node.width() ?? DEFAULT_WIDTH,
      height: node.height() ?? DEFAULT_HEIGHT,
      outputRatio: node.getAttr("javascriptEditorOutputRatio") ?? DEFAULT_OUTPUT_RATIO,
    };
  }

  async applySerializedData(node, data = {}) {
    this.#applyNodeData(node, data, {
      syncEditor: true,
      rerunPreview: true,
    });
  }

  #applyNodeData(node, data = {}, { syncEditor = true, rerunPreview = false } = {}) {
    const nextData = {
      title: normalizeTitle(data.title),
      code: normalizeCode(data.code),
      width: normalizeDimension(data.width, DEFAULT_WIDTH, MIN_WIDTH),
      height: normalizeDimension(data.height, DEFAULT_HEIGHT, MIN_HEIGHT),
      outputRatio: normalizeOutputRatio(data.outputRatio),
    };

    node.setAttr("javascriptEditorTitle", nextData.title);
    node.setAttr("javascriptEditorCode", nextData.code);
    node.setAttr("javascriptEditorOutputRatio", nextData.outputRatio);
    syncChrome(node, nextData);

    const overlayState = node._javascriptEditorOverlayState ?? null;
    if (!overlayState) {
      return;
    }

    overlayState.titleEl.textContent = nextData.title;

    if (syncEditor) {
      if (overlayState.fallbackTextarea.value !== nextData.code) {
        overlayState.fallbackTextarea.value = nextData.code;
      }
      overlayState.setMonacoValue?.(nextData.code);
    }

    this.#syncOverlay(node);

    if (rerunPreview) {
      this.#runCode(node);
    }
  }

  #bindLifecycle(node) {
    if (node._javascriptEditorLifecycleBound) return;
    node._javascriptEditorLifecycleBound = true;

    const cleanup = () => {
      this.#removeOverlay(node);
      this.app.off("node:removed", handleRemoved);
      this.app.off("document:load:start", handleDocumentLoadStart);
      node._javascriptEditorLifecycleBound = false;
    };

    const handleRemoved = ({ node: removedNode }) => {
      if (removedNode !== node) return;
      cleanup();
    };

    const handleDocumentLoadStart = () => {
      cleanup();
    };

    this.app.on("node:removed", handleRemoved);
    this.app.on("document:load:start", handleDocumentLoadStart);
  }

  #removeOverlay(node) {
    node._javascriptEditorInlineChange?.cancel?.();
    node._javascriptEditorInlineChange = null;

    const cleanup = node._javascriptEditorOverlayCleanup;
    if (typeof cleanup === "function") {
      cleanup();
    }

    node._javascriptEditorOverlayCleanup = null;
    node._javascriptEditorOverlayState = null;
  }

  #syncOverlay(node) {
    const overlay = node._javascriptEditorOverlayEl;
    if (!overlay || !node.getStage?.()) return;

    const isVisible = node.isVisible?.() !== false;
    const [a, b, c, d, e, f] = node.getAbsoluteTransform().getMatrix();

    overlay.style.width = `${node.width()}px`;
    overlay.style.height = `${node.height()}px`;
    overlay.style.opacity = String(node.opacity?.() ?? 1);
    overlay.style.zIndex = String(Math.max(1, this.app.getSelectableStackIndex?.(node) ?? 1));
    overlay.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;

    const occlusionRects = isVisible
      ? getSharedOverlayOcclusionRects(this.app, node, node.width(), node.height())
      : [];
    const hasOcclusion = occlusionRects.length > 0;
    overlay.hidden = !isVisible;
    overlay.classList.toggle("is-stack-occluded", hasOcclusion);
    this.#applyOverlayOcclusion(overlay, node.width(), node.height(), occlusionRects);
    if (!isVisible) return;

    node._javascriptEditorOverlayState?.applyOutputLayout?.();
    node._javascriptEditorOverlayState?.syncPreviewViewport?.();
    node._javascriptEditorOverlayState?.layoutEditor?.();
  }

  #applyOverlayOcclusion(overlay, width, height, occlusionRects = []) {
    applySharedOverlayOcclusionStyles(overlay, width, height, occlusionRects);
  }

  #setStatus(node, text, tone = "idle") {
    const statusEl = node._javascriptEditorOverlayState?.statusEl ?? null;
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  }

  #setConsoleUnread(node, tone = "warning") {
    const overlayState = node._javascriptEditorOverlayState ?? null;
    const consoleTab = overlayState?.consoleTab ?? null;
    if (!consoleTab) return;
    if (overlayState.activeTab === "console") {
      delete consoleTab.dataset.unreadTone;
      overlayState.unreadConsoleTone = null;
      return;
    }

    const nextTone = tone === "error" ? "error" : "warning";
    const currentTone = overlayState.unreadConsoleTone ?? null;
    const resolvedTone = currentTone === "error" ? "error" : nextTone;
    overlayState.unreadConsoleTone = resolvedTone;
    consoleTab.dataset.unreadTone = resolvedTone;
  }

  #clearConsoleUnread(node) {
    const overlayState = node._javascriptEditorOverlayState ?? null;
    const consoleTab = overlayState?.consoleTab ?? null;
    if (!consoleTab) return;
    delete consoleTab.dataset.unreadTone;
    overlayState.unreadConsoleTone = null;
  }

  #setActiveTab(node, nextTab = "preview") {
    const overlayState = node._javascriptEditorOverlayState ?? null;
    if (!overlayState) return;

    const activeTab = nextTab === "console" ? "console" : "preview";
    overlayState.activeTab = activeTab;

    const isPreview = activeTab === "preview";
    overlayState.previewTab.setAttribute("aria-selected", isPreview ? "true" : "false");
    overlayState.consoleTab.setAttribute("aria-selected", isPreview ? "false" : "true");
    overlayState.previewPanel.hidden = !isPreview;
    overlayState.consolePanel.hidden = isPreview;
    if (!isPreview) {
      this.#clearConsoleUnread(node);
    }
    if (isPreview) {
      overlayState.refreshPreviewViewport?.();
    }
  }

  #completePendingConnectionToSelf(node) {
    const connectionsPlugin = this.app.getPlugin?.("connections") ?? null;
    if (!connectionsPlugin?.connectingFromId) return false;
    if (typeof connectionsPlugin.completeConnectingTo !== "function") return false;

    void connectionsPlugin.completeConnectingTo(node);
    return true;
  }

  #hideContextMenu() {
    const contextMenuPlugin = this.app.getPlugin?.("context-menu") ?? null;
    contextMenuPlugin?.hideMenu?.();
  }

  #openContextMenu(node, clientPoint) {
    const toolbarPlugin = this.app.getPlugin?.("javascript-editor-toolbar") ?? null;
    if (typeof toolbarPlugin?.openLayerMenu === "function") {
      this.#hideContextMenu();
      toolbarPlugin.openLayerMenu(node, clientPoint);
      return;
    }

    const contextMenuPlugin = this.app.getPlugin?.("context-menu") ?? null;
    if (!contextMenuPlugin?.showMenu) return;
    if (contextMenuPlugin.isEnabled?.() === false) return;

    const items = this.app.contextMenu?.getItems?.(node) ?? [];
    if (!items.length) return;

    const nextClientPoint = this.#getContextMenuClientPoint(node, clientPoint, items.length);
    this.app.getPlugin?.("selection")?.setSelected?.([node]);
    contextMenuPlugin.showMenu(node, nextClientPoint);
  }


  #getContextMenuClientPoint(node, clientPoint, itemCount = 1) {
    const overlay = node._javascriptEditorOverlayEl ?? null;
    const stage = node.getStage?.() ?? null;
    const contextMenuPlugin = this.app.getPlugin?.("context-menu") ?? null;
    if (!overlay || !stage || !contextMenuPlugin) {
      return clientPoint;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const containerRect = stage.container().getBoundingClientRect();
    const isInsideOverlay = (
      clientPoint.x >= overlayRect.left &&
      clientPoint.x <= overlayRect.right &&
      clientPoint.y >= overlayRect.top &&
      clientPoint.y <= overlayRect.bottom
    );
    if (!isInsideOverlay) {
      return clientPoint;
    }

    const menuWidth = contextMenuPlugin.menuWidth ?? 180;
    const itemHeight = contextMenuPlugin.itemHeight ?? 36;
    const paddingY = contextMenuPlugin.paddingY ?? 6;
    const menuHeight = paddingY * 2 + Math.max(1, itemCount) * itemHeight;
    const gutter = 12;

    const safeX = clamp(
      clientPoint.x,
      containerRect.left + 8,
      containerRect.right - menuWidth - 8,
    );
    const safeY = clamp(
      clientPoint.y,
      containerRect.top + 8,
      containerRect.bottom - menuHeight - 8,
    );

    if (containerRect.right - overlayRect.right >= menuWidth + gutter) {
      return {
        x: overlayRect.right + gutter,
        y: safeY,
      };
    }

    if (overlayRect.left - containerRect.left >= menuWidth + gutter) {
      return {
        x: overlayRect.left - menuWidth - gutter,
        y: safeY,
      };
    }

    if (containerRect.bottom - overlayRect.bottom >= menuHeight + gutter) {
      return {
        x: safeX,
        y: overlayRect.bottom + gutter,
      };
    }

    if (overlayRect.top - containerRect.top >= menuHeight + gutter) {
      return {
        x: safeX,
        y: overlayRect.top - menuHeight - gutter,
      };
    }

    return {
      x: safeX,
      y: safeY,
    };
  }

  #clearConsole(node) {
    const consoleEl = node._javascriptEditorOverlayState?.consoleEl ?? null;
    if (consoleEl) {
      consoleEl.replaceChildren();
    }
    this.#clearConsoleUnread(node);
  }

  #appendConsoleLine(node, { level = "log", text = "" } = {}) {
    const consoleEl = node._javascriptEditorOverlayState?.consoleEl ?? null;
    if (!consoleEl) return;

    const line = document.createElement("div");
    line.className = "javascript-editor-component__console-line";
    line.dataset.level = level;
    line.textContent = String(text ?? "");
    consoleEl.append(line);

    const limit = 60;
    while (consoleEl.childElementCount > limit) {
      consoleEl.firstElementChild?.remove();
    }

    consoleEl.scrollTop = consoleEl.scrollHeight;
    this.#setConsoleUnread(node, level === "error" ? "error" : "warning");
  }

  #createInlineChangeTracker(node) {
    let active = false;
    let timeoutId = null;

    const finish = () => {
      if (!active) return;
      active = false;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      this.app.events.emit("node:changed", { node });
    };

    return {
      touch: () => {
        if (!active) {
          active = true;
          this.app.events.emit("node:change:start", { node });
        }

        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(finish, EDIT_COMMIT_DELAY);
      },
      flush: () => finish(),
      cancel: () => {
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        active = false;
      },
    };
  }

  #runCode(node) {
    const overlayState = node._javascriptEditorOverlayState ?? null;
    if (!overlayState?.setPreviewDocument) return;
    const runRevision = (overlayState.runRevision ?? 0) + 1;

    node._javascriptEditorInlineChange?.flush?.();
    this.#hideContextMenu();
    this.#clearConsole(node);
    this.#setStatus(node, "Running...", "running");
    overlayState.runButton.disabled = true;
    overlayState.runRevision = runRevision;
    overlayState.setPreviewDocument(buildRuntimeDocument({
      code: node.getAttr("javascriptEditorCode") ?? DEFAULT_CODE,
      nodeId: node.id?.(),
      runRevision,
    }));
  }

  #mountOverlay(node) {
    this.#removeOverlay(node);

    const stage = node.getStage();
    if (!stage) return;

    const stageContainer = stage.container();
    stageContainer.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.className = "javascript-editor-component__overlay";
    overlay.hidden = !node.isVisible?.();
    overlay.setAttribute("data-testid", "javascript-editor-overlay");
    overlay.dataset.javascriptEditorNodeId = node.id?.() ?? "";

    const header = document.createElement("div");
    header.className = "javascript-editor-component__header";
    header.setAttribute("data-testid", "javascript-editor-header");

    const heading = document.createElement("div");
    heading.className = "javascript-editor-component__heading";

    const titleEl = document.createElement("strong");
    titleEl.className = "javascript-editor-component__title";
    titleEl.setAttribute("data-testid", "javascript-editor-title");
    titleEl.textContent = node.getAttr("javascriptEditorTitle") ?? DEFAULT_TITLE;

    const headerActions = document.createElement("div");
    headerActions.className = "javascript-editor-component__header-actions";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "javascript-editor-component__close calc-widget__close";
    closeButton.setAttribute("aria-label", "Remove JS Code Runner");
    closeButton.setAttribute("data-testid", "javascript-editor-close");
    closeButton.innerHTML = '<span aria-hidden="true">&times;</span>';

    heading.append(titleEl);
    headerActions.append(closeButton);
    header.append(heading, headerActions);

    const body = document.createElement("div");
    body.className = "javascript-editor-component__body";

    const editorPane = document.createElement("section");
    editorPane.className = "javascript-editor-component__editor";
    editorPane.setAttribute("data-testid", "javascript-editor-editor");

    const editorSurface = document.createElement("div");
    editorSurface.className = "javascript-editor-component__editor-surface";

    const monacoHost = document.createElement("div");
    monacoHost.className = "javascript-editor-component__monaco";
    monacoHost.hidden = true;

    const fallbackTextarea = document.createElement("textarea");
    fallbackTextarea.className = "javascript-editor-component__textarea";
    fallbackTextarea.setAttribute("spellcheck", "false");
    fallbackTextarea.setAttribute("autocomplete", "off");
    fallbackTextarea.setAttribute("autocapitalize", "off");
    fallbackTextarea.setAttribute("data-testid", "javascript-editor-textarea");
    fallbackTextarea.value = node.getAttr("javascriptEditorCode") ?? DEFAULT_CODE;

    editorSurface.append(monacoHost, fallbackTextarea);
    editorPane.append(editorSurface);

    const splitter = document.createElement("button");
    splitter.type = "button";
    splitter.className = "javascript-editor-component__splitter";
    splitter.setAttribute("aria-label", "Resize editor and output");
    splitter.setAttribute("data-testid", "javascript-editor-splitter");

    const outputPane = document.createElement("section");
    outputPane.className = "javascript-editor-component__output";
    outputPane.setAttribute("data-testid", "javascript-editor-output-panel");

    const outputBar = document.createElement("div");
    outputBar.className = "javascript-editor-component__output-bar";

    const tabs = document.createElement("div");
    tabs.className = "javascript-editor-component__tabs";
    tabs.setAttribute("role", "tablist");

    const previewTab = document.createElement("button");
    previewTab.type = "button";
    previewTab.className = "javascript-editor-component__tab";
    previewTab.setAttribute("role", "tab");
    previewTab.setAttribute("data-testid", "javascript-editor-tab-preview");
    previewTab.textContent = "Preview";

    const consoleTab = document.createElement("button");
    consoleTab.type = "button";
    consoleTab.className = "javascript-editor-component__tab";
    consoleTab.setAttribute("role", "tab");
    consoleTab.setAttribute("data-testid", "javascript-editor-tab-console");
    consoleTab.textContent = "Console";

    const outputActions = document.createElement("div");
    outputActions.className = "javascript-editor-component__controls";

    const statusEl = document.createElement("span");
    statusEl.className = "javascript-editor-component__status";
    statusEl.setAttribute("data-testid", "javascript-editor-status");
    statusEl.dataset.tone = "idle";
    statusEl.textContent = "Ready";

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "javascript-editor-component__secondary";
    clearButton.setAttribute("data-testid", "javascript-editor-clear");
    clearButton.textContent = "Clear";

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "javascript-editor-component__run";
    runButton.setAttribute("data-testid", "javascript-editor-run");
    runButton.textContent = "Run";

    tabs.append(previewTab, consoleTab);
    outputActions.append(statusEl, clearButton, runButton);
    outputBar.append(tabs, outputActions);

    const outputPanels = document.createElement("div");
    outputPanels.className = "javascript-editor-component__output-panels";

    const previewPanel = document.createElement("div");
    previewPanel.className = "javascript-editor-component__panel";
    previewPanel.setAttribute("data-testid", "javascript-editor-output-preview");

    const previewConnectionShield = document.createElement("div");
    previewConnectionShield.className = "javascript-editor-component__connection-shield";
    previewConnectionShield.hidden = true;
    previewConnectionShield.setAttribute("aria-hidden", "true");

    const consolePanel = document.createElement("div");
    consolePanel.className = "javascript-editor-component__panel";
    consolePanel.setAttribute("data-testid", "javascript-editor-output-console");

    const consoleEl = document.createElement("div");
    consoleEl.className = "javascript-editor-component__console";
    consoleEl.setAttribute("data-testid", "javascript-editor-console");

    consolePanel.append(consoleEl);
    outputPanels.append(previewPanel, consolePanel);
    outputPane.append(outputBar, outputPanels);
    body.append(editorPane, splitter, outputPane);
    overlay.append(header, body);
    stageContainer.append(overlay);

    const selectionPlugin = this.app.getPlugin?.("selection") ?? null;
    const connectionsPlugin = this.app.getPlugin?.("connections") ?? null;
    const inlineChange = this.#createInlineChangeTracker(node);
    node._javascriptEditorInlineChange = inlineChange;

    let monacoEditor = null;
    let ignoreMonacoChanges = false;
    let resizingOutput = false;
    let dragStartY = 0;
    let outputStartHeight = 0;
    let outputAvailableHeight = 0;
    let iframe = null;
    let stackSyncFrame = null;

    const isEditableInteraction = () => (
      !this.app.isReadOnly?.() &&
      this.app.modeManager?.matches?.({ mode: "edit", editorTool: "arrange" }) === true
    );
    const isShapeMode = () => (
      this.app.getMode?.() === "edit" &&
      this.app.getEditorTool?.() === "shape"
    );

    const scheduleStackSync = () => {
      if (stackSyncFrame != null) return;
      stackSyncFrame = window.requestAnimationFrame(() => {
        stackSyncFrame = null;
        this.#syncOverlay(node);
      });
    };

    const syncSelection = () => {
      if (!isEditableInteraction()) return;
      selectionPlugin?.setSelected?.([node]);
    };

    const syncConnectionTargetMode = () => {
      const sourceId = connectionsPlugin?.connectingFromId ?? null;
      const canTargetThisNode = isEditableInteraction() && Boolean(sourceId) && sourceId !== node.id?.();
      previewConnectionShield.hidden = !canTargetThisNode;
      overlay.classList.toggle("is-connection-target", canTargetThisNode);
    };

    const clearPointerInteractionState = () => {
      resizingOutput = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    const syncInteractionMode = () => {
      const editable = isEditableInteraction();
      overlay.classList.toggle("is-read-only", !editable);
      overlay.dataset.interactionMode = editable ? "edit" : "view";
      overlay.classList.toggle("is-pointer-pass-through", isShapeMode());
      fallbackTextarea.readOnly = !editable;
      fallbackTextarea.setAttribute("aria-readonly", String(!editable));
      closeButton.hidden = !editable;
      closeButton.disabled = !editable;
      splitter.disabled = !editable;
      if (iframe) {
        iframe.style.pointerEvents = editable ? "none" : "auto";
      }
      monacoEditor?.updateOptions?.({
        readOnly: !editable,
        domReadOnly: !editable,
      });

      if (!editable && resizingOutput) {
        clearPointerInteractionState();
      }

      syncConnectionTargetMode();
    };

    const createPreviewIframe = (srcdoc) => {
      const frame = document.createElement("iframe");
      frame.className = "javascript-editor-component__iframe";
      frame.setAttribute("data-testid", "javascript-editor-preview");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("title", "JavaScript preview");
      frame.srcdoc = srcdoc;
      return frame;
    };

    const setCodeFromEditor = (value, source = "textarea") => {
      const nextCode = normalizeCode(value);
      node.setAttr("javascriptEditorCode", nextCode);
      inlineChange.touch();

      if (source !== "textarea" && fallbackTextarea.value !== nextCode) {
        fallbackTextarea.value = nextCode;
      }

      if (source !== "monaco" && monacoEditor && monacoEditor.getValue() !== nextCode) {
        ignoreMonacoChanges = true;
        monacoEditor.setValue(nextCode);
        ignoreMonacoChanges = false;
      }
    };

    const setMonacoValue = (value) => {
      if (!monacoEditor || monacoEditor.getValue() === value) return;
      ignoreMonacoChanges = true;
      monacoEditor.setValue(value);
      ignoreMonacoChanges = false;
    };

    const layoutEditor = () => {
      monacoEditor?.layout?.();
    };

    const getBodyContentHeight = (measuredHeight) => {
      const styles = window.getComputedStyle(body);
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
      return Math.max(0, measuredHeight - paddingTop - paddingBottom);
    };

    const applyOutputLayout = () => {
      const splitterHeight = splitter.offsetHeight || 10;
      const { editorHeight, outputHeight } = getPaneHeights(
        getBodyContentHeight(body.clientHeight),
        splitterHeight,
        node.getAttr("javascriptEditorOutputRatio") ?? DEFAULT_OUTPUT_RATIO,
      );

      editorPane.style.flex = `0 0 ${editorHeight}px`;
      outputPane.style.flex = `0 0 ${outputHeight}px`;
      syncPreviewViewport();
      layoutEditor();
    };

    const syncPreviewViewport = () => {
      if (!iframe) return;
      const nextWidth = Math.max(0, previewPanel.clientWidth || outputPanels.clientWidth || 0);
      const nextHeight = Math.max(0, previewPanel.clientHeight || outputPanels.clientHeight || 0);

      if (nextWidth > 0) {
        iframe.style.width = `${nextWidth}px`;
      }

      if (nextHeight > 0) {
        iframe.style.height = `${nextHeight}px`;
      }
    };

    const refreshPreviewViewport = () => {
      if (!iframe) return;
      if ((node._javascriptEditorOverlayState?.activeTab ?? "preview") !== "preview") return;
      syncPreviewViewport();
      iframe.style.visibility = "hidden";
      window.requestAnimationFrame(() => {
        if (!iframe.isConnected) return;
        syncPreviewViewport();
        iframe.style.visibility = "";
      });
    };

    const handlePreviewLoad = () => {
      runButton.disabled = false;
      const currentTone = statusEl.dataset.tone;
      if (currentTone === "running") {
        this.#setStatus(node, "Preview updated", "ready");
      }
      refreshPreviewViewport();
    };

    const setPreviewDocument = (srcdoc) => {
      const nextIframe = createPreviewIframe(srcdoc);
      nextIframe.addEventListener("load", handlePreviewLoad);
      previewPanel.replaceChildren(nextIframe, previewConnectionShield);
      iframe = nextIframe;
      if (node._javascriptEditorOverlayState) {
        node._javascriptEditorOverlayState.iframe = nextIframe;
      }
      nextIframe.style.pointerEvents = isEditableInteraction() ? "none" : "auto";
      syncPreviewViewport();
      refreshPreviewViewport();
      syncConnectionTargetMode();
    };

    fallbackTextarea.addEventListener("input", () => {
      setCodeFromEditor(fallbackTextarea.value, "textarea");
    });

    fallbackTextarea.addEventListener("blur", () => {
      inlineChange.flush();
    });

    fallbackTextarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        this.#runCode(node);
      }
    });

    loadMonacoRuntime().then((monaco) => {
      if (!monaco || !overlay.isConnected || monacoEditor) {
        return;
      }

      monacoHost.hidden = false;
      fallbackTextarea.hidden = true;

      monacoEditor = monaco.editor.create(monacoHost, {
        value: node.getAttr("javascriptEditorCode") ?? DEFAULT_CODE,
        language: "javascript",
        theme: "vs",
        automaticLayout: true,
        minimap: { enabled: false },
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        fontSize: 12,
        lineHeight: 18,
        letterSpacing: 0,
        scrollBeyondLastLine: false,
        glyphMargin: false,
        folding: false,
        lineNumbersMinChars: 3,
        padding: { top: 8, bottom: 8 },
        fontFamily: '"Consolas", "Cascadia Mono", "Courier New", monospace',
        contextmenu: false,
        readOnly: !isEditableInteraction(),
        domReadOnly: !isEditableInteraction(),
        scrollbar: {
          alwaysConsumeMouseWheel: false,
          useShadows: false,
        },
      });

      monacoEditor.onDidChangeModelContent(() => {
        if (ignoreMonacoChanges) return;
        setCodeFromEditor(monacoEditor.getValue(), "monaco");
      });

      monacoEditor.onDidBlurEditorWidget(() => {
        inlineChange.flush();
      });

      monacoEditor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => this.#runCode(node),
      );

      layoutEditor();
      syncInteractionMode();
    });

    const beginOutputResize = (event) => {
      if (!isEditableInteraction()) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.#hideContextMenu();
      stage.setPointersPositions?.(event);
      syncSelection();
      resizingOutput = true;
      dragStartY = event.clientY;

      const bodyRect = body.getBoundingClientRect();
      const splitterRect = splitter.getBoundingClientRect();
      const outputRect = outputPane.getBoundingClientRect();
      outputStartHeight = outputRect.height;
      outputAvailableHeight = Math.max(
        1,
        getBodyContentHeight(bodyRect.height) - splitterRect.height,
      );

      this.app.events.emit("node:change:start", { node });
      document.body.style.userSelect = "none";
      document.body.style.cursor = "row-resize";
    };

    const onPointerMove = (event) => {
      if (!resizingOutput) return;
      const nextOutputHeight = clampOutputHeight(
        outputAvailableHeight,
        outputStartHeight - (event.clientY - dragStartY),
      );

      node.setAttr(
        "javascriptEditorOutputRatio",
        getOutputRatioForHeight(outputAvailableHeight, nextOutputHeight),
      );
      applyOutputLayout();
    };

    const endPointerInteraction = (event) => {
      if (!resizingOutput) return;
      stage.setPointersPositions?.(event);
      resizingOutput = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      this.app.events.emit("node:changed", { node });
    };

    const handleOverlayMouseDown = (event) => {
      this.#hideContextMenu();
      if (event.button === 0 && this.#completePendingConnectionToSelf(node)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!isEditableInteraction()) return;

      syncSelection();
      if (event.button === 0) {
        this.#setActiveTab(node, node._javascriptEditorOverlayState?.activeTab ?? "preview");
      }
    };

    const handleOverlayContextMenu = (event) => {
      if (!isEditableInteraction()) return;
      event.preventDefault();
      event.stopPropagation();
      this.#openContextMenu(node, {
        x: event.clientX,
        y: event.clientY,
      });
    };

    overlay.addEventListener("mousedown", handleOverlayMouseDown, true);
    overlay.addEventListener("contextmenu", handleOverlayContextMenu, true);
    const cleanupDragBridge = createOverlayNodeDragBridge({
      app: this.app,
      node,
      handle: header,
      canStartDrag: () => isEditableInteraction(),
      isInteractiveTarget: (target) => target instanceof Element && Boolean(target.closest("button")),
      onPointerDown: () => {
        this.#hideContextMenu();
        syncSelection();
      },
    });
    header.addEventListener("dblclick", (event) => {
      if (!isEditableInteraction()) return;
      if (event.target.closest("button")) return;
      event.preventDefault();
      event.stopPropagation();
    });
    splitter.addEventListener("mousedown", beginOutputResize);
    previewConnectionShield.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (!isEditableInteraction()) return;
      event.preventDefault();
      event.stopPropagation();
      this.#hideContextMenu();
      this.#completePendingConnectionToSelf(node);
    });
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", endPointerInteraction);
    const offConnectionPickStart = this.app.on("connection:pick:start", syncConnectionTargetMode);
    const offConnectionPickEnd = this.app.on("connection:pick:end", syncConnectionTargetMode);
    const offInteractionChange = this.app.on("interaction:change", syncInteractionMode);
    const offNodeAddedForStack = this.app.on("node:added", scheduleStackSync);
    const offNodeRemovedForStack = this.app.on("node:removed", scheduleStackSync);
    const offNodeChangingForStack = this.app.on("node:changing", scheduleStackSync);
    const offNodeChangedForStack = this.app.on("node:changed", scheduleStackSync);

    previewTab.addEventListener("click", () => {
      this.#setActiveTab(node, "preview");
    });

    consoleTab.addEventListener("click", () => {
      this.#setActiveTab(node, "console");
    });

    runButton.addEventListener("click", () => {
      this.#runCode(node);
    });

    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isEditableInteraction()) return;
      this.#hideContextMenu();
      this.app.destroySelectableNodeTree(node);
    });

    clearButton.addEventListener("click", () => {
      const nextRevision = (node._javascriptEditorOverlayState?.runRevision ?? 0) + 1;
      this.#hideContextMenu();
      this.#clearConsole(node);
      this.#setStatus(node, "Preview cleared", "idle");
      this.#setActiveTab(node, "preview");
      runButton.disabled = false;
      node._javascriptEditorOverlayState.runRevision = nextRevision;
      setPreviewDocument(buildEmptyPreviewDocument(node.id?.(), nextRevision));
    });

    const handleMessage = (event) => {
      const data = event.data ?? null;
      if (
        !iframe ||
        event.source !== iframe.contentWindow ||
        !data ||
        data.source !== "javascript-editor-component" ||
        data.nodeId !== node.id?.() ||
        data.runRevision !== (node._javascriptEditorOverlayState?.runRevision ?? 0)
      ) {
        return;
      }

      if (data.type === "preview:pointerdown") {
        this.#hideContextMenu();
        if ((data.payload?.button ?? 0) === 0) {
          if (this.#completePendingConnectionToSelf(node)) {
            return;
          }
          syncSelection();
        }
        return;
      }

      if (data.type === "contextmenu") {
        if (!isEditableInteraction()) return;
        const rect = iframe.getBoundingClientRect();
        this.#openContextMenu(node, {
          x: rect.left + Number(data.payload?.x ?? 0),
          y: rect.top + Number(data.payload?.y ?? 0),
        });
        return;
      }

      if (data.type === "console") {
        this.#appendConsoleLine(node, {
          level: data.payload?.level ?? "log",
          text: data.payload?.text ?? "",
        });
        return;
      }

      if (data.type === "runtime-error") {
        runButton.disabled = false;
        this.#setStatus(node, "Runtime error", "error");
        this.#setActiveTab(node, "console");
        this.#appendConsoleLine(node, {
          level: "error",
          text: data.payload?.message ?? "Unknown runtime error",
        });
        return;
      }

      if (data.type === "run:complete") {
        runButton.disabled = false;
        this.#setStatus(node, "Preview updated", "ready");
        refreshPreviewViewport();
      }
    };

    window.addEventListener("message", handleMessage);
    setPreviewDocument(buildEmptyPreviewDocument(node.id?.(), 0));

    const sync = () => this.#syncOverlay(node);
    node.on(
      "dragmove.javascriptEditorOverlay transform.javascriptEditorOverlay absoluteTransformChange.javascriptEditorOverlay",
      sync,
    );
    stage.on(
      `xChange.javascriptEditor${node._id} yChange.javascriptEditor${node._id} scaleXChange.javascriptEditor${node._id} scaleYChange.javascriptEditor${node._id}`,
      sync,
    );

    node._javascriptEditorOverlayEl = overlay;
    node._javascriptEditorOverlayState = {
      titleEl,
      statusEl,
      fallbackTextarea,
      iframe,
      consoleEl,
      previewTab,
      consoleTab,
      previewPanel,
      consolePanel,
      outputPane,
      runButton,
      closeButton,
      applyOutputLayout,
      syncPreviewViewport,
      refreshPreviewViewport,
      setPreviewDocument,
      setMonacoValue,
      layoutEditor,
      activeTab: "preview",
      runRevision: 0,
      unreadConsoleTone: null,
      get editorMode() {
        return monacoEditor ? "monaco" : "textarea";
      },
    };
    node._javascriptEditorOverlayCleanup = () => {
      inlineChange.cancel();
      window.removeEventListener("message", handleMessage);
      if (stackSyncFrame != null) {
        window.cancelAnimationFrame(stackSyncFrame);
        stackSyncFrame = null;
      }
      offConnectionPickStart?.();
      offConnectionPickEnd?.();
      offInteractionChange?.();
      offNodeAddedForStack?.();
      offNodeRemovedForStack?.();
      offNodeChangingForStack?.();
      offNodeChangedForStack?.();
      cleanupDragBridge?.();
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", endPointerInteraction);
      overlay.removeEventListener("mousedown", handleOverlayMouseDown, true);
      overlay.removeEventListener("contextmenu", handleOverlayContextMenu, true);
      node.off(".javascriptEditorOverlay");
      stage.off(`.javascriptEditor${node._id}`);
      monacoEditor?.dispose?.();
      monacoEditor = null;
      overlay.remove();
      node._javascriptEditorOverlayEl = null;
      node._javascriptEditorOverlayCleanup = null;
      node._javascriptEditorOverlayState = null;
    };

    this.#setActiveTab(node, "preview");
    syncInteractionMode();
    this.#syncOverlay(node);
  }
}
