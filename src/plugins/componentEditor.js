import {
  BaseCommand,
  BaseContextMenuItem,
  BasePlugin,
} from "../core/baseClasses.js";

class OpenComponentEditorCommand extends BaseCommand {
  static commandId = "component:edit";
  static label = "Edit Component";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  execute() {
    this.plugin.openForSelection();
  }
}

class OpenComponentEditorMenuItem extends BaseContextMenuItem {
  static itemId = "component:edit-menu";
  static label = "Edit...";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  condition(node) {
    return !!this.app.components.getEditor(node);
  }

  execute(node) {
    this.plugin.open(node);
  }
}

export class ComponentEditorPlugin extends BasePlugin {
  static pluginId = "component-editor";
  static modes = {
    edit: {
      tools: {
        arrange: {},
      },
    },
  };

  commands() {
    return [OpenComponentEditorCommand];
  }

  menuItems() {
    return [OpenComponentEditorMenuItem];
  }

  onSetup() {
    this.currentNode = null;
    this.currentEditor = null;
    this.selectedNodes = [];

    this.buildModal();

    this.listen("selection:change", ({ nodes }) => {
      this.selectedNodes = nodes;
    });

    this.listen("component-editor:open", ({ node }) => {
      this.open(node);
    });

    this.listen("interaction:change", () => {
      if (!this.isEnabled()) {
        this.close();
      }
    });
    this.listen("document:load:start", () => this.close());

    this.app.keybindings.register("Enter", "component:edit");
    this.cleanups.push(() => this.app.keybindings.unregister("Enter"));

    this.app.stage.on("dblclick.componentEditor dbltap.componentEditor", (event) => {
      if (!this.isEnabled()) return;
      if (event?.evt && typeof this.app.stage?.setPointersPositions === "function") {
        this.app.stage.setPointersPositions(event.evt);
      }
      const button = event.evt?.button;
      if (button != null && button !== 0) return;
      let target = event.target;
      if (target === this.app.stage && typeof this.app.stage?.getIntersection === "function") {
        const pointer = this.app.stage.getPointerPosition() ?? (() => {
          const { clientX, clientY } = event.evt ?? {};
          if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
          const rect = this.app.stage.container().getBoundingClientRect();
          return { x: clientX - rect.left, y: clientY - rect.top };
        })();
        const intersection = pointer ? this.app.stage.getIntersection(pointer) : null;
        const selectable = intersection?.findAncestor?.(".selectable", true)
          ?? (intersection?.hasName?.("selectable") ? intersection : null);
        if (selectable?.listening?.() !== false) {
          target = intersection;
        }
      }

      const selectable = target?.findAncestor?.(".selectable", true)
        ?? (target?.hasName?.("selectable") ? target : null);
      if (selectable?.getAttr?.("componentType") === "text") {
        selectable.openInlineEditor?.(event);
        return;
      }

      const selectedText = this.findSelectedTextAtPointer();
      if (selectedText) {
        selectedText.openInlineEditor?.(event);
        return;
      }

      this.open(target);
    });

    this.cleanups.push(() => {
      this.app.stage.off(".componentEditor");
      this.overlay.remove();
    });
  }

  buildModal() {
    this.overlay = document.createElement("div");
    this.overlay.className = "component-editor-modal";
    this.overlay.dataset.testid = "component-editor-modal";
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="component-editor-modal__backdrop" data-close-editor></div>
      <div
        class="component-editor-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="component-editor-title"
        data-testid="component-editor-dialog"
      >
        <div class="component-editor-modal__header">
          <div>
            <p class="component-editor-modal__eyebrow">Component Editor</p>
            <h2
              id="component-editor-title"
              class="component-editor-modal__title"
              data-testid="component-editor-title"
            ></h2>
            <p
              class="component-editor-modal__description"
              data-testid="component-editor-description"
            ></p>
          </div>
          <button
            type="button"
            class="component-editor-modal__close"
            data-close-editor
            data-testid="component-editor-close"
            aria-label="Close component editor"
          >
            ✕
          </button>
        </div>
        <form class="component-editor-modal__form" data-testid="component-editor-form">
          <div class="component-editor-modal__fields" data-testid="component-editor-fields"></div>
          <div
            class="component-editor-modal__attachments"
            data-testid="component-editor-attachments"
            hidden
          >
            <p
              class="component-editor-modal__attachments-hint"
              data-testid="component-editor-attachments-hint"
            >
              Attachments save immediately.
            </p>
            <div
              class="component-editor-modal__attachments-body"
              data-testid="component-editor-attachments-body"
            ></div>
          </div>
          <div class="component-editor-modal__actions">
            <button
              type="button"
              class="ghost-button"
              data-close-editor
              data-testid="component-editor-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="component-editor-modal__submit"
              data-testid="component-editor-apply"
            >
              Apply
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.append(this.overlay);

    this.titleEl = this.overlay.querySelector(".component-editor-modal__title");
    this.descriptionEl = this.overlay.querySelector(".component-editor-modal__description");
    this.fieldsEl = this.overlay.querySelector(".component-editor-modal__fields");
    this.attachmentsEl = this.overlay.querySelector("[data-testid='component-editor-attachments']");
    this.attachmentsBodyEl = this.overlay.querySelector(
      "[data-testid='component-editor-attachments-body']",
    );
    this.formEl = this.overlay.querySelector(".component-editor-modal__form");
    this.formEl.noValidate = true;

    this.listenDom(this.overlay, "click", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeEditor != null) {
        this.close();
      }
    });

    this.listenDom(this.overlay, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    this.listenDom(this.formEl, "submit", (event) => {
      event.preventDefault();
      void this.apply();
    });
  }

  openForSelection() {
    if (this.selectedNodes.length !== 1) return;
    this.open(this.selectedNodes[0]);
  }

  findSelectedTextAtPointer() {
    const pointer = this.app.stage.getPointerPosition();
    const textNode = this.selectedNodes.length === 1 &&
      this.selectedNodes[0]?.getAttr?.("componentType") === "text"
      ? this.selectedNodes[0]
      : null;
    if (!pointer || !textNode?.getStage?.()) return null;

    const point = this.app.stageApi.screenToCanvas(pointer);
    const box = textNode.getClientRect({
      relativeTo: this.app.stage,
      skipShadow: true,
      skipStroke: true,
    });
    const inside =
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height;

    return inside ? textNode : null;
  }

  open(node) {
    const editor = this.app.components.getEditor(node);
    if (!editor) return;

    this.currentNode = editor.node;
    this.currentEditor = editor;
    this.renderEditor(editor);
    this.overlay.hidden = false;

    const firstField = this.fieldsEl.querySelector("input, textarea, select");
    firstField?.focus();
    firstField?.select?.();
  }

  close() {
    this.currentNode = null;
    this.currentEditor = null;
    this.overlay.hidden = true;
    this.fieldsEl.replaceChildren();
    this.unmountAttachments();
  }

  renderEditor(editor) {
    this.titleEl.textContent = editor.title;
    this.descriptionEl.textContent = editor.description ?? "";
    this.descriptionEl.hidden = !editor.description;
    this.fieldsEl.replaceChildren();
    this.unmountAttachments();

    editor.fields.forEach((field) => {
      const fieldEl = document.createElement("div");
      fieldEl.className = "component-editor-modal__field";
      fieldEl.dataset.testid = `component-editor-field-${field.id}`;

      const labelEl = document.createElement("label");
      labelEl.className = "component-editor-modal__field-label";
      labelEl.textContent = field.label;
      labelEl.htmlFor = `component-editor-${field.id}`;
      fieldEl.append(labelEl);

      if (field.description) {
        const descriptionEl = document.createElement("span");
        descriptionEl.className = "component-editor-modal__field-description";
        descriptionEl.textContent = field.description;
        fieldEl.append(descriptionEl);
      }

      const inputEl = this.createInput(field, editor.node);
      fieldEl.append(inputEl);
      this.fieldsEl.append(fieldEl);
    });

    this.mountAttachments(editor);
  }

  mountAttachments(editor) {
    if (!this.attachmentsEl || !this.attachmentsBodyEl) return;

    const component = editor?.component ?? null;
    const node = editor?.node ?? null;
    const supportsAttachments = !!component?.supportsAttachments?.(node);

    if (!supportsAttachments) {
      this.attachmentsEl.hidden = true;
      this.attachmentsBodyEl.replaceChildren();
      return;
    }

    const attachmentsPlugin = this.app.getPlugin("attachments");
    if (!attachmentsPlugin?.mountInline) {
      this.attachmentsEl.hidden = true;
      this.attachmentsBodyEl.replaceChildren();
      return;
    }

    this.attachmentsEl.hidden = false;
    attachmentsPlugin.mountInline(this.attachmentsBodyEl, node);
  }

  unmountAttachments() {
    if (this.attachmentsEl) {
      this.attachmentsEl.hidden = true;
    }
    this.attachmentsBodyEl?.replaceChildren();

    const attachmentsPlugin = this.app.getPlugin("attachments");
    attachmentsPlugin?.unmountInline?.();
  }

  createInput(field, node) {
    const inputId = `component-editor-${field.id}`;
    const inputAttributes = field.getInputAttributes(node);
    const value = field.read(node);
    const input =
      field.type === "textarea"
        ? document.createElement("textarea")
        : document.createElement("input");

    input.id = inputId;
    input.name = field.id;
    input.className = "component-editor-modal__input";
    input.placeholder = field.placeholder ?? "";
    input.dataset.testid = `component-editor-input-${field.id}`;

    if (field.type === "textarea") {
      input.rows = field.rows ?? 4;
      input.value = value ?? "";
    } else if (field.type === "checkbox") {
      input.type = "checkbox";
      input.checked = value === true;
    } else if (field.type === "file") {
      const wrapper = document.createElement("div");
      wrapper.className = "component-editor-modal__file-wrapper";

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = inputId;
      fileInput.name = field.id;
      fileInput.className = "component-editor-modal__file-input";
      fileInput.dataset.testid = `component-editor-input-${field.id}`;

      const label = document.createElement("label");
      label.htmlFor = inputId;
      label.className = "component-editor-modal__file-button";
      label.textContent = "Click to select file";

      const fileName = document.createElement("span");
      fileName.className = "component-editor-modal__file-name";
      fileName.textContent = "No file chosen";

      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        fileName.textContent = file ? file.name : "No file chosen";
      });

      Object.entries(inputAttributes).forEach(([key, attrValue]) => {
        fileInput.setAttribute(key, String(attrValue));
      });

      wrapper.append(fileInput, label, fileName);
      return wrapper;
    } else {
      input.type = field.type;
      input.value = value ?? "";
    }

    Object.entries(inputAttributes).forEach(([key, attrValue]) => {
      input.setAttribute(key, String(attrValue));
    });

    return input;
  }

  async apply() {
    if (!this.currentEditor || !this.currentNode) return;

    this.app.events.emit("node:change:start", { node: this.currentNode });

    for (const field of this.currentEditor.fields) {
      const input = this.formEl.elements.namedItem(field.id);
      if (!input) continue;

      if (field.type === "file") {
        const file = input.files?.[0];
        if (file) {
          await field.write(this.currentNode, file);
        }
        continue;
      }

      await field.write(
        this.currentNode,
        field.type === "checkbox" ? input.checked : input.value,
      );
    }

    this.currentNode.getLayer()?.batchDraw();
    this.app.overlayLayer.batchDraw();
    this.app.uiLayer.batchDraw();
    this.app.events.emit("node:changed", { node: this.currentNode });
    this.close();
  }
}
