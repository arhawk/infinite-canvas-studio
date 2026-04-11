import { describe, expect, it } from "vitest";
import { computeHiddenNodeIds } from "../../../src/plugins/mindMapBranch.js";

// Build a tree item (as returned by buildCatalogTree — items have a `children` array)
function makeTreeItem({ id, nodeId, collapsed = false, children = [] }) {
  return { id, nodeId, collapsed, children };
}

describe("computeHiddenNodeIds", () => {
  it("returns empty set for an empty tree", () => {
    const hidden = computeHiddenNodeIds([]);
    expect(hidden.size).toBe(0);
  });

  it("returns empty set when all items are expanded", () => {
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: false,
        children: [
          makeTreeItem({ id: "b", nodeId: "node-b", collapsed: false, children: [] }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    expect(hidden.size).toBe(0);
  });

  it("hides all children of a collapsed root item", () => {
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: true,
        children: [
          makeTreeItem({ id: "b", nodeId: "node-b", collapsed: false, children: [] }),
          makeTreeItem({ id: "c", nodeId: "node-c", collapsed: false, children: [] }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    expect(hidden).toEqual(new Set(["node-b", "node-c"]));
  });

  it("hides all descendants (deep subtree) of a collapsed item", () => {
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: true,
        children: [
          makeTreeItem({
            id: "b", nodeId: "node-b", collapsed: false,
            children: [
              makeTreeItem({ id: "c", nodeId: "node-c", collapsed: false, children: [] }),
            ],
          }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    expect(hidden).toEqual(new Set(["node-b", "node-c"]));
  });

  it("hides only grandchildren when parent is expanded but child is collapsed", () => {
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: false,
        children: [
          makeTreeItem({
            id: "b", nodeId: "node-b", collapsed: true,
            children: [
              makeTreeItem({ id: "c", nodeId: "node-c", collapsed: false, children: [] }),
            ],
          }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    // node-b is visible (parent a is expanded), node-c is hidden (parent b is collapsed)
    expect(hidden.has("node-a")).toBe(false);
    expect(hidden.has("node-b")).toBe(false);
    expect(hidden.has("node-c")).toBe(true);
  });

  it("hides all descendants of a collapsed ancestor even if a descendant is also collapsed", () => {
    // If A is collapsed, B and C are both hidden regardless of B's own collapsed state
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: true,
        children: [
          makeTreeItem({
            id: "b", nodeId: "node-b", collapsed: true,  // also collapsed, but irrelevant
            children: [
              makeTreeItem({ id: "c", nodeId: "node-c", collapsed: false, children: [] }),
            ],
          }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    expect(hidden).toEqual(new Set(["node-b", "node-c"]));
  });

  it("handles multiple root items independently", () => {
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: true,
        children: [
          makeTreeItem({ id: "b", nodeId: "node-b", collapsed: false, children: [] }),
        ],
      }),
      makeTreeItem({
        id: "c", nodeId: "node-c", collapsed: false,
        children: [
          makeTreeItem({ id: "d", nodeId: "node-d", collapsed: false, children: [] }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    expect(hidden.has("node-b")).toBe(true);
    expect(hidden.has("node-c")).toBe(false);
    expect(hidden.has("node-d")).toBe(false);
  });

  it("does not add the collapsed item itself to the hidden set", () => {
    const tree = [
      makeTreeItem({
        id: "a", nodeId: "node-a", collapsed: true,
        children: [
          makeTreeItem({ id: "b", nodeId: "node-b", collapsed: false, children: [] }),
        ],
      }),
    ];
    const hidden = computeHiddenNodeIds(tree);
    // The collapsed item (node-a) itself remains visible; only its children are hidden
    expect(hidden.has("node-a")).toBe(false);
    expect(hidden.has("node-b")).toBe(true);
  });
});
