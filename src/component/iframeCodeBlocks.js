import { BaseComponent, TextareaEditorField } from "../core/baseClasses.js";
import { Konva } from "../lib/konva.js";

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 240;
const DEFAULT_CODE = `// Write JavaScript here, press ▶ Run or Ctrl+Enter to execute

document.body.innerHTML = '<h1>Hello World</h1>';`;
const MONACO_CDN = "https://unpkg.com/monaco-editor@0.52.2/min/vs";

let _monacoState = "idle";
let _monacoCallbacks = [];

function loadMonaco(onReady) {
  if (_monacoState === "ready") { onReady(window.monaco); return; }
  _monacoCallbacks.push(onReady);
  if (_monacoState === "loading") return;
  _monacoState = "loading";
  const script = document.createElement("script");
  script.src = `${MONACO_CDN}/loader.js`;
  script.onload = () => {
    window.require.config({ paths: { vs: MONACO_CDN } });
    window.require(["vs/editor/editor.main"], () => {
      _monacoState = "ready";
      const cbs = _monacoCallbacks.splice(0);
      for (const cb of cbs) cb(window.monaco);
    });
  };
  script.onerror = () => {
    _monacoState = "idle";
    const cbs = _monacoCallbacks.splice(0);
    for (const cb of cbs) cb(null);
  };
  document.head.appendChild(script);
}

function syncOverlay(group, overlay, stage, app) {
  if (!group.getStage()) return;
  const stageBox = stage.container().getBoundingClientRect();
  const nodeRect = group.getClientRect({ relativeTo: stage, skipStroke: true, skipShadow: true });
  const screenPos = app.stageApi.canvasToScreen({ x: nodeRect.x, y: nodeRect.y });
  const scale = app.stageApi.getScale?.() ?? stage.scaleX();
  Object.assign(overlay.style, {
    left: `${stageBox.left + screenPos.x}px`,
    top: `${stageBox.top + screenPos.y}px`,
    width: `${nodeRect.width * scale}px`,
    height: `${nodeRect.height * scale}px`,
  });
}

function execCode(editor, iframe) {
  const code = editor.getValue();
  iframe.srcdoc =
    `<!DOCTYPE html><html><head>` +
    `<style>body{font-family:sans-serif;padding:12px;margin:0;}</style>` +
    `</head><body><script>` +
    `try{${code}}catch(e){document.body.innerHTML='<pre style="color:red;margin:0">'+String(e)+'<\/pre>';}` +
    `<\/script></body></html>`;
}

export class IframeCodeBlocksComponent extends BaseComponent {
  static type = "iframe-code-blocks";
  static label = "Code Runner";
  static description = "JavaScript editor with live iframe preview";
  static palette = true;
  static attachments = false;

  getEditorTitle() { return "Code Runner"; }

  editorFields() {
    return [
      new TextareaEditorField({
        id: "code",
        label: "JavaScript",
        getValue: (node) => node.getAttr("crCode") ?? DEFAULT_CODE,
        setValue: (node, value) => {
          node.setAttr("crCode", value ?? DEFAULT_CODE);
          const editor = node.getAttr("_crEditor");
          if (editor && editor.getValue() !== value) editor.setValue(value ?? DEFAULT_CODE);
        },
      }),
    ];
  }

  async createNode({
    x, y,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    code = DEFAULT_CODE,
    title = "{ }  JS Runner",
  } = {}) {
    const app = this.app;
    const stage = app.stage;
    const ns = `cr${Date.now().toString(36)}`;

    // ── Konva anchor (transparent — overlay is the visual) ─────────
    const group = new Konva.Group({ x, y, width, height, draggable: true });
    const bg = new Konva.Rect({
      name: "code-runner-bg",
      width, height,
      // Near-transparent so Konva hit-detection still works (for transformer)
      fill: "rgba(0,0,0,0.001)",
      strokeWidth: 0,
      cornerRadius: 8,
    });
    group.add(bg);
    group.setAttr("crCode", code);
    group.setAttr("crTitle", title);

    // ── HTML overlay (always visible, IS the visual component) ─────
    const overlay = document.createElement("div");
    overlay.className = "code-runner-overlay";

    const header = document.createElement("div");
    header.className = "code-runner-overlay__header";
    const titleSpan = document.createElement("span");
    titleSpan.className = "code-runner-overlay__title";
    titleSpan.textContent = title;
    titleSpan.title = "Double-click to rename";
    titleSpan.addEventListener("dblclick", () => {
      const original = titleSpan.textContent;
      const input = document.createElement("input");
      input.className = "code-runner-overlay__title-input";
      input.value = original;
      titleSpan.replaceWith(input);
      input.focus(); input.select();
      let escaping = false;
      input.addEventListener("blur", () => {
        const newTitle = !escaping && input.value.trim() ? input.value.trim() : original;
        titleSpan.textContent = newTitle;
        group.setAttr("crTitle", newTitle);
        if (input.parentNode) input.replaceWith(titleSpan);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { e.preventDefault(); escaping = true; input.blur(); }
      });
    });
    const closeBtn = document.createElement("button");
    closeBtn.className = "code-runner-overlay__close";
    closeBtn.textContent = "✕";
    closeBtn.title = "Remove from canvas";
    header.append(titleSpan, closeBtn);

    const editorDiv = document.createElement("div");
    editorDiv.className = "code-runner-overlay__editor";
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "code-runner-overlay__loading";
    loadingMsg.textContent = "Loading editor…";
    editorDiv.appendChild(loadingMsg);

    const splitter = document.createElement("div");
    splitter.className = "code-runner-overlay__splitter";
    splitter.title = "Drag to resize";

    const previewBar = document.createElement("div");
    previewBar.className = "code-runner-overlay__preview-bar";
    const runBtn = document.createElement("button");
    runBtn.className = "code-runner-overlay__run-btn";
    runBtn.textContent = "▶ Run";
    runBtn.disabled = true;
    const clearBtn = document.createElement("button");
    clearBtn.className = "code-runner-overlay__clear-btn";
    clearBtn.textContent = "↺";
    clearBtn.title = "Clear preview";
    previewBar.append(runBtn, clearBtn);

    const iframe = document.createElement("iframe");
    iframe.className = "code-runner-overlay__preview";
    iframe.setAttribute("sandbox", "allow-scripts");

    clearBtn.addEventListener("click", () => { iframe.srcdoc = ""; });

    overlay.append(header, editorDiv, splitter, previewBar, iframe);
    document.body.appendChild(overlay);
    group.setAttr("_crOverlay", overlay);

    const doSync = () => syncOverlay(group, overlay, stage, app);

    // ── Header drag: moves the Konva group ────────────────────────
    let headerDragging = false;
    let hStartX = 0, hStartY = 0, nStartX = 0, nStartY = 0;

    const onHeaderMove = (e) => {
      if (!headerDragging) return;
      const scale = app.stageApi.getScale?.() ?? stage.scaleX();
      group.x(nStartX + (e.clientX - hStartX) / scale);
      group.y(nStartY + (e.clientY - hStartY) / scale);
      group.getLayer()?.batchDraw();
      doSync();
    };

    const onHeaderUp = () => {
      if (!headerDragging) return;
      headerDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      header.style.cursor = "grab";
      app.events.emit("node:changed", { node: group });
    };

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".code-runner-overlay__close")) return;
      e.preventDefault();
      headerDragging = true;
      hStartX = e.clientX;
      hStartY = e.clientY;
      nStartX = group.x();
      nStartY = group.y();
      header.style.cursor = "grabbing";
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      app.events.emit("node:change:start", { node: group });
    });

    // ── ✕ removes the component from canvas ─────────────────────
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      stage.off(`.${ns}`);
      group.off(`.${ns}`);
      document.removeEventListener("mousemove", onHeaderMove);
      document.removeEventListener("mouseup", onHeaderUp);
      document.removeEventListener("mousemove", onSplitterMove);
      document.removeEventListener("mouseup", onSplitterUp);
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup", onResizeUp);
      group.getAttr("_crEditor")?.dispose?.();
      overlay.remove();
      group.destroy();
      stage.batchDraw();
    });

    // ── Splitter drag: resize editor / preview ────────────────────
    let splitterDragging = false;
    let sStartY = 0, editorStartH = 0, previewStartH = 0;

    const onSplitterMove = (e) => {
      if (!splitterDragging) return;
      const delta = e.clientY - sStartY;
      const total = editorStartH + previewStartH;
      const newEditorH = Math.max(80, Math.min(total - 60, editorStartH + delta));
      const newPreviewH = total - newEditorH;
      editorDiv.style.flex = "none";
      editorDiv.style.height = `${newEditorH}px`;
      iframe.style.flex = "none";
      iframe.style.height = `${newPreviewH}px`;
      group.getAttr("_crEditor")?.layout?.();
    };

    const onSplitterUp = () => {
      if (!splitterDragging) return;
      splitterDragging = false;
      iframe.style.pointerEvents = "";
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    splitter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitterDragging = true;
      sStartY = e.clientY;
      editorStartH = editorDiv.offsetHeight;
      previewStartH = iframe.offsetHeight;
      iframe.style.pointerEvents = "none";
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    });

    // ── HTML resize handles (8 directions) ───────────────────────
    const RESIZE_DIRS = [
      { n: "nw", cx: -1, cy: -1 }, { n: "n", cx:  0, cy: -1 }, { n: "ne", cx:  1, cy: -1 },
      { n: "w",  cx: -1, cy:  0 },                              { n: "e",  cx:  1, cy:  0 },
      { n: "sw", cx: -1, cy:  1 }, { n: "s", cx:  0, cy:  1 }, { n: "se", cx:  1, cy:  1 },
    ];
    let resizing = false, rDir = null;
    let rStartX = 0, rStartY = 0, rStartW = 0, rStartH = 0, rStartGX = 0, rStartGY = 0;

    const onResizeMove = (e) => {
      if (!resizing || !rDir) return;
      const cs = app.stageApi.getScale?.() ?? stage.scaleX();
      const dx = (e.clientX - rStartX) / cs;
      const dy = (e.clientY - rStartY) / cs;
      let newW = rStartW, newH = rStartH, newGX = rStartGX, newGY = rStartGY;
      if (rDir.cx ===  1) newW = Math.max(MIN_WIDTH,  rStartW + dx);
      if (rDir.cx === -1) { newW = Math.max(MIN_WIDTH,  rStartW - dx); newGX = rStartGX + rStartW - newW; }
      if (rDir.cy ===  1) newH = Math.max(MIN_HEIGHT, rStartH + dy);
      if (rDir.cy === -1) { newH = Math.max(MIN_HEIGHT, rStartH - dy); newGY = rStartGY + rStartH - newH; }
      group.x(newGX); group.y(newGY);
      group.width(newW); group.height(newH);
      bg.width(newW); bg.height(newH);
      group.getLayer()?.batchDraw();
      doSync();
    };
    const onResizeUp = () => {
      if (!resizing) return;
      resizing = false; rDir = null;
      iframe.style.pointerEvents = "";
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      app.events.emit("node:changed", { node: group });
    };
    for (const dir of RESIZE_DIRS) {
      const handle = document.createElement("div");
      handle.className = `code-runner-overlay__resize code-runner-overlay__resize--${dir.n}`;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        resizing = true; rDir = dir;
        rStartX = e.clientX; rStartY = e.clientY;
        rStartW = bg.width(); rStartH = bg.height();
        rStartGX = group.x(); rStartGY = group.y();
        iframe.style.pointerEvents = "none";
        document.body.style.userSelect = "none";
        app.events.emit("node:change:start", { node: group });
      });
      overlay.appendChild(handle);
    }

    // ── Resize transform: live sync during drag, bake on release ──
    group.on(`transform.${ns}`, doSync);

    group.on(`transformend.${ns}`, () => {
      const sx = Math.abs(group.scaleX());
      const sy = Math.abs(group.scaleY());
      const newW = Math.max(MIN_WIDTH, bg.width() * sx);
      const newH = Math.max(MIN_HEIGHT, bg.height() * sy);
      group.scale({ x: 1, y: 1 });
      group.width(newW); group.height(newH);
      bg.width(newW); bg.height(newH);
      doSync();
    });

    group.on(`dragmove.${ns}`, doSync);
    stage.on(`xChange.${ns} yChange.${ns} scaleXChange.${ns}`, doSync);

    group.on(`visibleChange.${ns}`, () => {
      overlay.style.display = group.visible() ? "flex" : "none";
    });

    group.on(`destroy.${ns}`, () => {
      stage.off(`.${ns}`);
      group.off(`.${ns}`);
      document.removeEventListener("mousemove", onHeaderMove);
      document.removeEventListener("mouseup", onHeaderUp);
      document.removeEventListener("mousemove", onSplitterMove);
      document.removeEventListener("mouseup", onSplitterUp);
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup", onResizeUp);
      group.getAttr("_crEditor")?.dispose?.();
      overlay.remove();
    });

    document.addEventListener("mousemove", onHeaderMove);
    document.addEventListener("mouseup", onHeaderUp);
    document.addEventListener("mousemove", onSplitterMove);
    document.addEventListener("mouseup", onSplitterUp);
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeUp);

    // ── Monaco lazy load ──────────────────────────────────────────
    loadMonaco((monaco) => {
      const lm = overlay.querySelector(".code-runner-overlay__loading");
      if (!monaco) { if (lm) lm.textContent = "Failed to load editor."; return; }
      if (lm) lm.remove();
      const editor = monaco.editor.create(editorDiv, {
        value: group.getAttr("crCode") ?? DEFAULT_CODE,
        language: "javascript",
        theme: "vs",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        padding: { top: 6 },
        glyphMargin: false,
        folding: false,
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 10,
        scrollbar: { horizontal: "auto", alwaysConsumeMouseWheel: false, useShadows: false },
        overviewRulerLanes: 0,
        renderLineHighlight: "line",
      });
      group.setAttr("_crEditor", editor);
      editor.onDidChangeModelContent(() => {
        group.setAttr("crCode", editor.getValue());
      });
      const doRun = () => {
        if (runBtn.disabled) return;
        runBtn.textContent = "Running…";
        runBtn.disabled = true;
        execCode(editor, iframe);
        iframe.addEventListener("load", () => {
          runBtn.textContent = "▶ Run";
          runBtn.disabled = false;
        }, { once: true });
      };
      runBtn.disabled = false;
      runBtn.addEventListener("click", doRun);
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, doRun);
    });

    setTimeout(doSync, 0);
    return group;
  }

  serializeNode(node) {
    const bg = node.findOne(".code-runner-bg");
    return {
      code: node.getAttr("crCode") ?? DEFAULT_CODE,
      title: node.getAttr("crTitle") ?? "{ }  JS Runner",
      width: bg?.width() ?? DEFAULT_WIDTH,
      height: bg?.height() ?? DEFAULT_HEIGHT,
    };
  }

  async applySerializedData(node, data = {}) {
    const { code = DEFAULT_CODE, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = data;
    const bg = node.findOne(".code-runner-bg");
    node.width(width); node.height(height);
    if (bg) { bg.width(width); bg.height(height); }
    node.setAttr("crCode", code);
    const editor = node.getAttr("_crEditor");
    if (editor && editor.getValue() !== code) editor.setValue(code);
  }
}
