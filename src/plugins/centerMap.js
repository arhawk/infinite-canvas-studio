import { BasePlugin } from "../core/baseClasses.js";
import { renderIcons } from "../lib/icons.js";

/**
 * CenterMapPlugin — Reset viewport to canvas origin
 *
 * Clicking the crosshair toolbar button (or pressing Home)
 * smoothly animates the canvas back to (0, 0) and resets zoom to 1.
 */
export class CenterMapPlugin extends BasePlugin {
  static pluginId = "center-map";

  onSetup() {
    const { centerMapEl } = this.options;
    this.ui = { centerMapEl };

    renderIcons(centerMapEl, {
      width: 16,
      height: 16,
      "stroke-width": 2,
    });

    // Button click
    this.listenDom(centerMapEl, "click", () => this.centerView());

    // Keyboard shortcut: Home
    this.listenDom(window, "keydown", (event) => {
      if (
        event.key === "Home" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        this.centerView();
      }
    });
  }

  centerView() {
    // Use stageApi.centerOn to smoothly animate back to canvas origin (0, 0)
    this.app.stageApi.centerOn({ x: 0, y: 0 }, { duration: 0.4, scale: 1 });
  }
}
