export class EditableTextBehavior {
  static attach(textNode, { fallbackText = "Text" } = {}) {
    textNode.on("dblclick dbltap", () => {
      const stage = textNode.getStage();
      const app = stage?.getAttr("app");
      if (!stage || (app && !app.modeManager.matches({ mode: "edit", editorTool: "arrange" }))) {
        return;
      }

      const textPosition = textNode.absolutePosition();
      const stageBox = stage.container().getBoundingClientRect();
      const screenPos = app.stageApi.canvasToScreen(textPosition);

      const area = document.createElement("textarea");
      area.value = textNode.text();
      area.className = "canvas-text-editor";
      document.body.append(area);

      Object.assign(area.style, {
        position: "fixed",
        left: `${stageBox.left + screenPos.x}px`,
        top: `${stageBox.top + screenPos.y}px`,
        width: `${Math.max(textNode.width() + 24, 120)}px`,
        minHeight: `${Math.max(textNode.height() + 18, 44)}px`,
        padding: "0.5rem 0.65rem",
        borderRadius: "0.75rem",
        border: "1px solid rgba(61, 47, 32, 0.18)",
        background: "#fffefb",
        boxShadow: "0 18px 50px rgba(54, 41, 25, 0.16)",
        zIndex: "50",
        resize: "none",
      });

      area.focus();
      area.select();

      let cancelled = false;

      const commit = () => {
        if (cancelled) return;
        textNode.text(area.value || fallbackText);
        textNode.getLayer()?.batchDraw();
        area.remove();
      };

      area.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          cancelled = true;
          area.remove();
        }

        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          commit();
        }
      });

      area.addEventListener("blur", commit, { once: true });
    });
  }
}
