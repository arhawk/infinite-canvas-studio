import { describe, expect, it, vi } from "vitest";
import { ModeManager } from "../../../src/core/modeManager.js";

function createToolRegistry() {
  return {
    has: vi.fn((toolId) => toolId === "arrange" || toolId === "brush"),
    setActive: vi.fn(),
  };
}

describe("ModeManager", () => {
  it("activates and deactivates features across mode transitions", () => {
    const eventBus = { emit: vi.fn() };
    const toolRegistry = createToolRegistry();
    const manager = new ModeManager({ eventBus, toolRegistry });
    const arrangeEnter = vi.fn();
    const arrangeExit = vi.fn();
    const presentationEnter = vi.fn();

    manager.register({
      id: "feature:test",
      modes: {
        edit: {
          tools: {
            arrange: {
              config: { snap: true },
              onEnter: arrangeEnter,
              onExit: arrangeExit,
            },
          },
        },
        presentation: {
          onEnter: presentationEnter,
        },
      },
    });

    expect(arrangeEnter).toHaveBeenCalledTimes(1);
    expect(manager.getConfig("feature:test")).toEqual({ snap: true });

    manager.setMode("presentation");

    expect(arrangeExit).toHaveBeenCalledTimes(1);
    expect(presentationEnter).toHaveBeenCalledTimes(1);
    expect(toolRegistry.setActive).toHaveBeenCalledWith(null);
    expect(eventBus.emit).toHaveBeenCalledWith("mode:change", { mode: "presentation" });
  });

  it("disables features when the active edit tool has no matching branch", () => {
    const manager = new ModeManager({
      eventBus: { emit: vi.fn() },
      toolRegistry: createToolRegistry(),
    });

    manager.register({
      id: "feature:test",
      modes: {
        edit: {
          tools: {
            arrange: {},
          },
        },
      },
    });

    expect(manager.isEnabled("feature:test")).toBe(true);

    manager.setEditorTool("brush");

    expect(manager.isEnabled("feature:test")).toBe(false);
  });
});
