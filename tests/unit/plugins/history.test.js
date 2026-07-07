import { describe, expect, it, vi } from "vitest";

vi.mock("konva", () => ({ default: {} }));

import { HistoryPlugin } from "../../../src/plugins/history.js";

function createHistoryPlugin(componentLabels = {}) {
  const plugin = Object.create(HistoryPlugin.prototype);
  plugin.app = {
    components: {
      get: (type) => (componentLabels[type] ? { label: componentLabels[type] } : null),
    },
  };
  return plugin;
}

describe("HistoryPlugin.describeOperation", () => {
  it("returns a fallback when operation is missing", () => {
    const plugin = createHistoryPlugin();
    expect(plugin.describeOperation(null)).toBe("making changes");
  });

  it("describes adding and deleting node trees", () => {
    const plugin = createHistoryPlugin({ sticky: "Sticky Note" });

    expect(plugin.describeOperation({
      type: "add-node-tree",
      snapshots: [{ type: "sticky" }],
    })).toBe("adding Sticky Note");

    expect(plugin.describeOperation({
      type: "remove-node-tree",
      snapshots: [{ type: "sticky" }],
    })).toBe("deleting Sticky Note");
  });

  it("describes drawing operations", () => {
    const plugin = createHistoryPlugin();

    expect(plugin.describeOperation({ type: "add-drawing" })).toBe("drawing a stroke");
    expect(plugin.describeOperation({ type: "remove-drawing" })).toBe("deleting a stroke");
  });

  it("describes node moves and edits", () => {
    const plugin = createHistoryPlugin({ text: "Text" });

    expect(plugin.describeOperation({
      type: "update-node",
      before: { type: "text", x: 0, y: 0, data: {} },
      after: { type: "text", x: 40, y: 0, data: {} },
    })).toBe("moving Text");

    expect(plugin.describeOperation({
      type: "update-node",
      before: { type: "text", x: 0, y: 0, data: { label: "A" } },
      after: { type: "text", x: 0, y: 0, data: { label: "B" } },
    })).toBe("editing Text");
  });

  it("collapses batch operations with one unique description", () => {
    const plugin = createHistoryPlugin({ sticky: "Sticky Note" });

    expect(plugin.describeOperation({
      type: "batch",
      operations: [
        { type: "add-node-tree", snapshots: [{ type: "sticky" }] },
        { type: "add-node-tree", snapshots: [{ type: "sticky" }] },
      ],
    })).toBe("adding Sticky Note");
  });

  it("summarizes mixed batch operations by count", () => {
    const plugin = createHistoryPlugin({ sticky: "Sticky Note", text: "Text" });

    expect(plugin.describeOperation({
      type: "batch",
      operations: [
        { type: "add-node-tree", snapshots: [{ type: "sticky" }] },
        { type: "add-node-tree", snapshots: [{ type: "text" }] },
      ],
    })).toBe("making 2 changes");
  });
});
