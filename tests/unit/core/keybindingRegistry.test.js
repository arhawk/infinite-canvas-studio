import { afterEach, describe, expect, it, vi } from "vitest";
import { KeybindingRegistry } from "../../../src/core/keybindingRegistry.js";

const registries = [];

afterEach(() => {
  registries.splice(0).forEach((registry) => registry.destroy());
  document.body.innerHTML = "";
});

describe("KeybindingRegistry", () => {
  it("runs matching commands for keyboard shortcuts", () => {
    const commandRegistry = { execute: vi.fn() };
    const registry = new KeybindingRegistry(commandRegistry);
    registries.push(registry);

    registry.register("Delete", "selection:delete");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));

    expect(commandRegistry.execute).toHaveBeenCalledWith("selection:delete");
  });

  it("supports Mod shortcuts with ctrl or meta", () => {
    const commandRegistry = { execute: vi.fn() };
    const registry = new KeybindingRegistry(commandRegistry);
    registries.push(registry);

    registry.register("Mod+D", "selection:duplicate");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }),
    );

    expect(commandRegistry.execute).toHaveBeenCalledWith("selection:duplicate");
  });

  it("ignores shortcuts while typing in form fields", () => {
    const commandRegistry = { execute: vi.fn() };
    const registry = new KeybindingRegistry(commandRegistry);
    registries.push(registry);

    registry.register("Enter", "selection:rename");
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(commandRegistry.execute).not.toHaveBeenCalled();
  });
});
