import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/core/eventBus.js";

describe("EventBus", () => {
  it("emits payloads to subscribed listeners", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on("selection:change", handler);
    bus.emit("selection:change", { nodes: [1, 2] });

    expect(handler).toHaveBeenCalledWith({ nodes: [1, 2] });
  });

  it("stops calling listeners after unsubscribe", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const off = bus.on("mode:change", handler);
    off();
    bus.emit("mode:change", { mode: "presentation" });

    expect(handler).not.toHaveBeenCalled();
  });
});
