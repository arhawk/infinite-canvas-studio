const DEBUG_PREFIX = "[inline-text]";

function debugInlineText(message, payload = {}) {
  console.info(DEBUG_PREFIX, message, payload);
}

export class EditableTextBehavior {
  static attach(textNode, {
    fallbackText = "Text",
    getHistoryNode = null,
    applyValue = null,
    getEditorBox = null,
    fitEditorToContent = false,
  } = {}) {
    const openInlineEditor = (event = {}) => {
      if (textNode.getAttr("inlineEditing")) return;

      const stage = textNode.getStage();
      const app = stage?.getAttr("app");
      if (!stage || (app && !app.modeManager.matches({ mode: "edit", editorTool: "arrange" }))) {
        debugInlineText("open skipped", {
          hasStage: Boolean(stage),
          mode: app?.getMode?.(),
          editorTool: app?.getEditorTool?.(),
        });
        return;
      }

      const button = event.evt?.button;
      if (button != null && button !== 0) {
        return;
      }

      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      event.evt?.stopPropagation?.();

      const editorId = `${textNode.id?.() || "text"}-${Date.now()}`;
      textNode.setAttr("inlineEditing", true);
      const wasDraggable = textNode.draggable();
      const previousOpacity = textNode.opacity();
      textNode.stopDrag();
      textNode.draggable(false);
      textNode.opacity(0);
      textNode.getLayer()?.batchDraw();

      const stageBox = stage.container().getBoundingClientRect();
      const stageScale = app?.stageApi?.getScale?.() ?? stage.scaleX();
      const textBox = textNode.getClientRect({
        relativeTo: stage,
        skipShadow: true,
        skipStroke: true,
      });
      const currentText = textNode.text();
      const editorBox = getEditorBox?.(textNode, {
        app,
        currentText,
        stage,
        textBox,
      }) ?? textBox;
      const screenPos = app.stageApi.canvasToScreen({
        x: editorBox.x,
        y: editorBox.y,
      });

      const area = document.createElement("textarea");
      area.value = currentText;
      area.className = "canvas-text-editor";
      area.dataset.testid = "canvas-text-editor";
      document.body.append(area);

      Object.assign(area.style, {
        left: `${stageBox.left + screenPos.x}px`,
        top: `${stageBox.top + screenPos.y}px`,
        width: `${Math.max(editorBox.width * stageScale, 48)}px`,
        height: `${Math.max(editorBox.height * stageScale, 32)}px`,
        padding: `${Math.max(textNode.padding() * stageScale, 2)}px`,
        fontFamily: textNode.fontFamily(),
        fontSize: `${textNode.fontSize() * stageScale}px`,
        lineHeight: String(textNode.lineHeight()),
        color: textNode.fill(),
      });

      const resizeToContent = () => {
        if (!fitEditorToContent) return;

        area.style.height = "auto";
        area.style.overflowY = "hidden";
        area.style.height = `${Math.max(
          Math.max(editorBox.height * stageScale, 32),
          area.scrollHeight + 2,
        )}px`;
      };

      resizeToContent();
      area.focus();
      area.select();
      debugInlineText("opened", {
        editorId,
        nodeId: textNode.id?.(),
        componentType: getHistoryNode?.(textNode)?.getAttr?.("componentType"),
        stageScale,
        editorBox,
        areaRect: area.getBoundingClientRect(),
      });

      let cancelled = false;
      let committed = false;
      let closed = false;
      let cleanupViewportListener = null;

      const cleanupEditor = (reason) => {
        if (closed) return;
        closed = true;
        cleanupViewportListener?.();
        cleanupViewportListener = null;
        document.removeEventListener("wheel", commitOnWheel, true);
        window.removeEventListener("resize", commitOnWindowResize);
        window.visualViewport?.removeEventListener?.("resize", commitOnVisualViewportResize);
        if (app?.activeInlineTextEditor?.element === area) {
          app.activeInlineTextEditor = null;
        }
        debugInlineText("cleanup", {
          editorId,
          reason,
          stillInDom: document.body.contains(area),
        });
        area.remove();
      };

      const restoreNodeState = () => {
        textNode.opacity(previousOpacity);
        textNode.draggable(wasDraggable);
        textNode.setAttr("inlineEditing", false);
        textNode.getLayer()?.batchDraw();
      };

      const closeEditor = (reason = "close") => {
        debugInlineText("close requested", { editorId, reason });
        restoreNodeState();
        cleanupEditor(reason);
      };

      const commit = (reason = "commit") => {
        debugInlineText("commit requested", {
          editorId,
          reason,
          cancelled,
          committed,
          value: area.value,
          areaRect: area.getBoundingClientRect(),
          stageScale: app?.stageApi?.getScale?.() ?? stage.scaleX(),
        });
        if (cancelled || committed) return;
        committed = true;

        const nextText = area.value || fallbackText;
        restoreNodeState();
        const historyNode = getHistoryNode?.(textNode) ?? textNode;
        if (nextText !== currentText) {
          app?.events.emit("node:change:start", { node: historyNode });
          if (typeof applyValue === "function") {
            applyValue(textNode, nextText, { historyNode, app });
          } else {
            textNode.text(nextText);
          }
          app?.events.emit("node:changed", { node: historyNode });
        }

        textNode.getLayer()?.batchDraw();
        cleanupEditor(reason);
      };

      function commitOnWheel(event) {
        debugInlineText("document wheel captured", {
          editorId,
          deltaY: event.deltaY,
          ctrlKey: event.ctrlKey,
          targetClass: event.target?.className,
        });
        commit("document-wheel");
      }

      function commitOnWindowResize() {
        commit("window-resize");
      }

      function commitOnVisualViewportResize() {
        commit("visual-viewport-resize");
      }

      if (app) {
        app.activeInlineTextEditor = {
          element: area,
          commit,
          close: closeEditor,
          editorId,
        };
        cleanupViewportListener = app.on?.("viewport:change", (payload) => {
          debugInlineText("viewport change captured", { editorId, payload });
          commit("viewport-change");
        }) ?? null;
      }

      document.addEventListener("wheel", commitOnWheel, { capture: true, passive: true });
      window.addEventListener("resize", commitOnWindowResize);
      window.visualViewport?.addEventListener?.("resize", commitOnVisualViewportResize);

      area.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          cancelled = true;
          closeEditor("escape");
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          commit("keyboard-submit");
        }
      });

      area.addEventListener("input", resizeToContent);
      area.addEventListener("blur", () => commit("blur"), { once: true });
    };

    textNode.openInlineEditor = openInlineEditor;
    textNode.on("dblclick dbltap", openInlineEditor);
  }
}
