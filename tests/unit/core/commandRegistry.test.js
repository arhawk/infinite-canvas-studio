import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../../src/core/commandRegistry.js";

describe("CommandRegistry", () => {
  it("registers mode features and executes enabled commands", () => {
    const cleanup = vi.fn();
    const app = {
      modeManager: {
        register: vi.fn(() => cleanup),
      },
    };
    const registry = new CommandRegistry(app);
    const execute = vi.fn(() => "ok");
    const command = {
      id: "focus:save-selection",
      createModeFeature: vi.fn(() => ({ id: "focus:save-selection", modes: {} })),
      isEnabled: vi.fn(() => true),
      execute,
    };

    registry.register(command);
    const result = registry.execute("focus:save-selection", 123);

    expect(app.modeManager.register).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(123);
    expect(result).toBe("ok");

    registry.unregister("focus:save-selection");
    expect(cleanup).toHaveBeenCalled();
  });

  it("does not execute disabled commands", () => {
    const registry = new CommandRegistry({
      modeManager: {
        register: vi.fn(),
      },
    });
    const execute = vi.fn();
    registry.register({
      id: "selection:delete",
      createModeFeature: () => null,
      isEnabled: () => false,
      execute,
    });

    registry.execute("selection:delete");

    expect(execute).not.toHaveBeenCalled();
  });
});
