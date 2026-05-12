import { describe, expect, it, vi } from "vitest";
import { ModeManager } from "../../../src/core/modeManager.js";

function createToolRegistry() {
  return {
    has: vi.fn((toolId) => ["arrange", "brush", "pen", "eraser"].includes(toolId)),
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

  it("normalizes brush tools back to arrange when entering presentation mode", () => {
    const eventBus = { emit: vi.fn() };
    const toolRegistry = createToolRegistry();
    const manager = new ModeManager({ eventBus, toolRegistry });

    manager.setEditorTool("pen");
    expect(manager.getEditorTool()).toBe("pen");

    manager.setMode("presentation");

    expect(manager.getEditorTool()).toBe("arrange");
    expect(toolRegistry.setActive).toHaveBeenLastCalledWith(null);
  });

  it("allows brush tools and eraser to be activated after entering presentation mode", () => {
    const manager = new ModeManager({
      eventBus: { emit: vi.fn() },
      toolRegistry: createToolRegistry(),
    });

    manager.setMode("presentation");
    manager.setEditorTool("pen");
    expect(manager.getEditorTool()).toBe("pen");

    manager.setEditorTool("eraser");
    expect(manager.getEditorTool()).toBe("eraser");
  });
});
