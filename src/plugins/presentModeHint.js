import { BasePlugin } from "../core/baseClasses.js";

export class PresentModeHintPlugin extends BasePlugin {
  static pluginId = "present-mode-hint";

  #toastEl = null;
  #hideTimer = null;
  #removeTimer = null;

  onSetup() {
    this.listen("mode:change", ({ mode }) => {
      if (mode === "presentation") {
        this.#showHint();
      } else {
        this.#cleanup();
      }
    });
  }

  #showHint() {
    this.#cleanup();

    const el = document.createElement("div");
    el.className = "present-mode-hint";
    el.textContent = "Press Esc to exit presentation mode";
    document.body.appendChild(el);
    this.#toastEl = el;

    requestAnimationFrame(() => el.classList.add("is-visible"));

    this.#hideTimer = setTimeout(() => {
      el.classList.remove("is-visible");
      this.#removeTimer = setTimeout(() => {
        el.remove();
        this.#toastEl = null;
      }, 450);
    }, 1800);
  }

  #cleanup() {
    clearTimeout(this.#hideTimer);
    clearTimeout(this.#removeTimer);
    this.#toastEl?.remove();
    this.#toastEl = null;
  }
}
