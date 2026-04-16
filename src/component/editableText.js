export class EditableTextBehavior {
  static attach(textNode, { fallbackText = "Text" } = {}) {
    textNode.on("dblclick dbltap", (event) => {
      if (textNode.getAttr("inlineEditing")) return;

      const stage = textNode.getStage();
      const app = stage?.getAttr("app");
      if (!stage || (app && !app.modeManager.matches({ mode: "edit", editorTool: "arrange" }))) {
        return;
      }

      const button = event.evt?.button;
      if (button != null && button !== 0) {
        return;
      }

      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      event.evt?.stopPropagation?.();

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
      const screenPos = app.stageApi.canvasToScreen({
        x: textBox.x,
        y: textBox.y,
      });
      const currentText = textNode.text();

      const area = document.createElement("textarea");
      area.value = currentText;
      area.className = "canvas-text-editor";
      area.dataset.testid = "canvas-text-editor";
      document.body.append(area);

      Object.assign(area.style, {
        left: `${stageBox.left + screenPos.x}px`,
        top: `${stageBox.top + screenPos.y}px`,
        width: `${Math.max(textBox.width * stageScale, 48)}px`,
        height: `${Math.max(textBox.height * stageScale, 32)}px`,
        padding: `${Math.max(textNode.padding() * stageScale, 2)}px`,
        fontFamily: textNode.fontFamily(),
        fontSize: `${textNode.fontSize() * stageScale}px`,
        lineHeight: String(textNode.lineHeight()),
        color: textNode.fill(),
      });

      area.focus();
      area.select();

      let cancelled = false;
      let committed = false;

      const restoreNodeState = () => {
        textNode.opacity(previousOpacity);
        textNode.draggable(wasDraggable);
        textNode.setAttr("inlineEditing", false);
        textNode.getLayer()?.batchDraw();
      };

      const closeEditor = () => {
        restoreNodeState();
        area.remove();
      };

      const commit = () => {
        if (cancelled || committed) return;
        committed = true;

        const nextText = area.value || fallbackText;
        restoreNodeState();
        if (nextText !== currentText) {
          app?.events.emit("node:change:start", { node: textNode });
          textNode.text(nextText);
          app?.events.emit("node:changed", { node: textNode });
        }

        textNode.getLayer()?.batchDraw();
        area.remove();
      };

      area.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          cancelled = true;
          closeEditor();
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      });

      area.addEventListener("blur", commit, { once: true });
    });
  }
}
