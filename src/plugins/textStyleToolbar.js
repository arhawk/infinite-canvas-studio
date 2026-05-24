import { BasePlugin } from "../core/baseClasses.js";
import {
  buildTextStylePayload,
  DEFAULT_TEXT_STYLE_PRESET_ID,
  getTextStylePreset,
  inferTextStylePresetId,
  normalizeTextStylePresetId,
  TEXT_STYLE_PRESETS,
} from "../component/textStylePresets.js";
import { withTrackedNodeMutation } from "./nodeMutation.js";

export class TextStyleToolbarPlugin extends BasePlugin {
  static pluginId = "text-style-toolbar";

  onSetup() {
    this.defaultPresetId = DEFAULT_TEXT_STYLE_PRESET_ID;
    this.selectedTextNode = null;
    this.toggleEl = this.options.toggleEl ?? null;
    this.dropdownEl = this.buildDropdown();
    this.optionButtons = new Map();
    this.open = false;

    for (const button of this.dropdownEl.querySelectorAll("[data-text-style-preset]")) {
      const presetId = button.dataset.textStylePreset;
      this.optionButtons.set(presetId, button);
      this.listenDom(button, "click", () => {
        this.applyPreset(presetId);
      });
    }

    if (this.toggleEl) {
      this.listenDom(this.toggleEl, "click", (event) => {
        event.stopPropagation();
        if (this.app.getMode() !== "edit") {
          this.close();
          return;
        }
        this.toggle();
      });
    }

    this.listen("selection:change", ({ nodes = [] } = {}) => {
      this.selectedTextNode =
        nodes.length === 1 && nodes[0]?.getAttr?.("componentType") === "text"
          ? nodes[0]
          : null;
      this.syncUi();
    });
    this.listen("interaction:change", () => {
      if (this.app.getMode() !== "edit") this.close();
      this.syncUi();
    });
    this.listen("document:load:end", () => this.syncUi());
    this.listen("node:changed", ({ node } = {}) => {
      if (node === this.selectedTextNode) this.syncUi();
    });
    this.listenDom(window, "resize", () => {
      if (this.open) this.positionDropdown();
    });
    this.listenDom(document, "mousedown", (event) => {
      if (!this.open) return;
      const target = event.target;
      if (this.dropdownEl.contains(target) || this.toggleEl?.contains?.(target)) return;
      this.close();
    }, true);
    this.listenDom(document, "keydown", (event) => {
      if (event.key === "Escape" && this.open) {
        this.close();
      }
    });

    this.syncUi();
    this.cleanups.push(() => this.dropdownEl?.remove?.());
  }

  getDefaultPresetId() {
    return this.defaultPresetId;
  }

  buildDropdown() {
    const root = document.createElement("div");
    root.className = "text-style-dropdown pen-dropdown";
    root.hidden = true;
    root.dataset.testid = "text-style-preset-dropdown";
    root.setAttribute("role", "menu");
    root.setAttribute("aria-label", "Text styles");
    root.innerHTML = `
      <div class="pen-dropdown__title">TEXT STYLE</div>
      <div class="text-style-dropdown__list">
        ${TEXT_STYLE_PRESETS.map((preset) => `
          <button
            type="button"
            class="text-style-dropdown__option"
            role="menuitemradio"
            aria-checked="false"
            data-text-style-preset="${preset.id}"
            data-testid="text-style-preset-${preset.id}"
          >
            <span class="text-style-dropdown__sample text-style-dropdown__sample--${preset.id}">
              ${preset.id === "title" ? "T" : preset.id === "body" ? "B" : "N"}
            </span>
            <span class="text-style-dropdown__meta">
              <strong>${preset.label}</strong>
              <small>${preset.description}</small>
            </span>
          </button>
        `).join("")}
      </div>
    `;
    document.querySelector(".app-shell")?.append(root);
    return root;
  }

  getNodePresetId(node = this.selectedTextNode) {
    if (node?.getAttr?.("componentType") !== "text") return null;
    return normalizeTextStylePresetId(
      node.getAttr?.("textStylePreset"),
      inferTextStylePresetId({
        fontSize: node.fontSize?.(),
        fontStyle: node.fontStyle?.(),
        fill: node.fill?.(),
      }),
    );
  }

  getActivePresetId() {
    return this.getNodePresetId() ?? this.defaultPresetId;
  }

  openDropdown() {
    if (!this.toggleEl) return;
    this.open = true;
    this.dropdownEl.hidden = false;
    this.positionDropdown();
    this.syncUi();
  }

  close() {
    this.open = false;
    this.dropdownEl.hidden = true;
    this.syncUi();
  }

  toggle() {
    if (this.open) {
      this.close();
      return;
    }
    this.openDropdown();
  }

  positionDropdown() {
    if (!this.toggleEl) return;
    const triggerRect = this.toggleEl.getBoundingClientRect();
    const shellRect = document.querySelector(".app-shell")?.getBoundingClientRect?.();
    if (!shellRect) return;
    this.dropdownEl.style.left = `${triggerRect.right - shellRect.left + 4}px`;
    this.dropdownEl.style.top = `${triggerRect.top - shellRect.top}px`;
  }

  async applyPreset(presetId) {
    const normalizedPresetId = normalizeTextStylePresetId(
      presetId,
      DEFAULT_TEXT_STYLE_PRESET_ID,
    );
    this.defaultPresetId = normalizedPresetId;

    const node = this.selectedTextNode;
    if (
      node?.getAttr?.("componentType") === "text" &&
      this.app.getMode() === "edit" &&
      this.app.getEditorTool() === "arrange"
    ) {
      const component = this.app.components.get("text");
      const current = component?.serializeNode?.(node);
      if (component && current) {
        await withTrackedNodeMutation(this.app, node, async () => {
          await component.applySerializedData(node, {
            ...current,
            ...buildTextStylePayload(normalizedPresetId),
          });
          node.getLayer?.()?.batchDraw?.();
          this.app.overlayLayer?.batchDraw?.();
          this.app.uiLayer?.batchDraw?.();
        });
      }
    }

    this.close();
    this.syncUi();
  }

  syncUi() {
    const activePresetId = this.getActivePresetId();
    const activePreset = getTextStylePreset(activePresetId);

    if (this.toggleEl) {
      this.toggleEl.setAttribute("aria-pressed", String(this.open));
      this.toggleEl.setAttribute("aria-expanded", String(this.open));
      this.toggleEl.setAttribute("aria-label", `Text styles (${activePreset.label})`);
      this.toggleEl.dataset.tooltip = `Text styles: ${activePreset.label}`;
    }

    for (const preset of TEXT_STYLE_PRESETS) {
      const isActive = preset.id === activePresetId;
      const button = this.optionButtons.get(preset.id);
      if (!button) continue;
      button.setAttribute("aria-checked", String(isActive));
      button.classList.toggle("is-active", isActive);
    }
  }
}
