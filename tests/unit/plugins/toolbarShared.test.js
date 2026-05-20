import { describe, expect, it, vi } from "vitest";

import {
  getClientPoint,
  getPluginById,
  resolveSelectable,
  resolveSelectableFromStageEvent,
} from "../../../src/plugins/toolbarShared.js";

describe("toolbarShared", () => {
  it("resolveSelectable returns direct selectable target", () => {
    const target = { hasName: (name) => name === "selectable" };
    expect(resolveSelectable(target)).toBe(target);
  });

  it("resolveSelectableFromStageEvent falls back to stage intersection", () => {
    const selectable = { hasName: (name) => name === "selectable", listening: () => true };
    const stage = {
      getIntersection: vi.fn(() => selectable),
      getPointerPosition: vi.fn(() => ({ x: 1, y: 1 })),
      setPointersPositions: vi.fn(),
    };
    const app = { stage };
    const direct = { hasName: () => false, findAncestor: () => ({ listening: () => false }) };

    const resolved = resolveSelectableFromStageEvent(app, { target: direct, evt: { clientX: 1, clientY: 1 } });

    expect(resolved).toBe(selectable);
    expect(stage.setPointersPositions).toHaveBeenCalled();
  });

  it("getClientPoint reads native client coordinates first", () => {
    const point = getClientPoint({}, { clientX: 10, clientY: 20 });
    expect(point).toEqual({ x: 10, y: 20 });
  });

  it("getPluginById resolves via getPlugin then fallback list", () => {
    const plugin = { id: "selection" };
    const app = {
      getPlugin: () => null,
      plugins: [{ id: "other" }, plugin],
    };
    expect(getPluginById(app, "selection")).toBe(plugin);
  });
});
