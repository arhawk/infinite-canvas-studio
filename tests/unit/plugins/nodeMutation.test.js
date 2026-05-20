import { describe, expect, it, vi } from "vitest";

import { withTrackedNodeMutation } from "../../../src/plugins/nodeMutation.js";

describe("withTrackedNodeMutation", () => {
  it("emits paired start/changed events on success", async () => {
    const emit = vi.fn();
    const app = { events: { emit } };
    const node = { id: () => "n1" };

    await withTrackedNodeMutation(app, node, async () => {});

    expect(emit).toHaveBeenNthCalledWith(1, "node:change:start", { node });
    expect(emit).toHaveBeenNthCalledWith(2, "node:changed", { node });
  });

  it("does not emit changed when mutation throws", async () => {
    const emit = vi.fn();
    const app = { events: { emit } };
    const node = { id: () => "n1" };

    await expect(withTrackedNodeMutation(app, node, async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("node:change:start", { node });
  });
});
