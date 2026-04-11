import { describe, expect, it } from "vitest";
import {
  findCatalogItemByNodeId,
  insertCatalogItemIntoItems,
  moveCatalogItemInItems,
  removeCatalogItemFromItems,
  reorderCatalogItemsInItems,
  toggleCatalogItemCollapsedInItems,
  traverseCatalogItems,
  updateCatalogItemTitleInItems,
} from "../../../src/catalog/api.js";

function makeItem({
  id,
  nodeId,
  title,
  titleSource = "node",
  parentId = null,
  order = 0,
  collapsed = false,
}) {
  return {
    id,
    nodeId,
    title,
    titleSource,
    parentId,
    order,
    collapsed,
  };
}

describe("catalog api", () => {
  it("adds a new root item at the end of its sibling list", () => {
    const items = [
      makeItem({ id: "item-1", nodeId: "node-1", title: "One", order: 0 }),
      makeItem({ id: "item-2", nodeId: "node-2", title: "Two", order: 1 }),
    ];

    const nextItems = insertCatalogItemIntoItems(items, {
      id: "item-3",
      nodeId: "node-3",
      title: "Three",
    });

    expect(nextItems.map((item) => [item.id, item.order])).toEqual([
      ["item-1", 0],
      ["item-2", 1],
      ["item-3", 2],
    ]);
    expect(nextItems[2].titleSource).toBe("node");
  });

  it("removes a catalog item together with its descendants", () => {
    const items = [
      makeItem({ id: "root", nodeId: "node-root", title: "Root", order: 0 }),
      makeItem({ id: "child", nodeId: "node-child", title: "Child", parentId: "root", order: 0 }),
      makeItem({ id: "grandchild", nodeId: "node-grand", title: "Grandchild", parentId: "child", order: 0 }),
      makeItem({ id: "peer", nodeId: "node-peer", title: "Peer", order: 1 }),
    ];

    const nextItems = removeCatalogItemFromItems(items, "child");

    expect(nextItems.map((item) => item.id)).toEqual(["root", "peer"]);
  });

  it("updates titles and collapsed state immutably", () => {
    const items = [makeItem({ id: "item-1", nodeId: "node-1", title: "Old", collapsed: false })];

    const renamed = updateCatalogItemTitleInItems(items, "item-1", "New");
    const toggled = toggleCatalogItemCollapsedInItems(renamed, "item-1");

    expect(renamed[0].title).toBe("New");
    expect(renamed[0].titleSource).toBe("manual");
    expect(toggled[0].collapsed).toBe(true);
    expect(items[0].title).toBe("Old");
    expect(items[0].titleSource).toBe("node");
    expect(items[0].collapsed).toBe(false);
  });

  it("preserves manual titles when items are moved or reordered", () => {
    const items = [
      makeItem({ id: "a", nodeId: "node-a", title: "Alpha", titleSource: "manual", order: 0 }),
      makeItem({ id: "b", nodeId: "node-b", title: "Beta", order: 1 }),
      makeItem({ id: "c", nodeId: "node-c", title: "Gamma", order: 2 }),
    ];

    const moved = moveCatalogItemInItems(items, "a", { parentId: null, index: 2 });
    const reordered = reorderCatalogItemsInItems(moved, null, ["b", "c", "a"]);

    expect(reordered.find((item) => item.id === "a")?.titleSource).toBe("manual");
    expect(reordered.find((item) => item.id === "a")?.title).toBe("Alpha");
  });

  it("normalizes legacy item data while keeping catalog-safe defaults", () => {
    const nextItems = insertCatalogItemIntoItems(
      [
        {
          id: "legacy-1",
          nodeId: "node-1",
          title: "  Legacy title  ",
          titleSource: "unknown",
          order: 4,
        },
      ],
      {
        id: "legacy-2",
        nodeId: "node-2",
        title: "  ",
      },
    );

    expect(nextItems.find((item) => item.id === "legacy-1")).toMatchObject({
      title: "Legacy title",
      titleSource: "node",
      order: 0,
    });
    expect(nextItems.find((item) => item.id === "legacy-2")).toMatchObject({
      title: "Untitled",
      titleSource: "node",
      order: 1,
    });
  });

  it("reparents and reorders items while keeping sibling order normalized", () => {
    const items = [
      makeItem({ id: "a", nodeId: "node-a", title: "A", order: 0 }),
      makeItem({ id: "b", nodeId: "node-b", title: "B", order: 1 }),
      makeItem({ id: "c", nodeId: "node-c", title: "C", order: 2 }),
      makeItem({ id: "child-1", nodeId: "node-child-1", title: "Child 1", parentId: "a", order: 0 }),
    ];

    const moved = moveCatalogItemInItems(items, "c", { parentId: "a", index: 0 });
    const childrenOfA = moved
      .filter((item) => item.parentId === "a")
      .sort((left, right) => left.order - right.order);

    expect(childrenOfA.map((item) => item.id)).toEqual(["c", "child-1"]);
    expect(childrenOfA.map((item) => item.order)).toEqual([0, 1]);

    const reorderedRoots = reorderCatalogItemsInItems(moved, null, ["b", "a"]);
    const rootItems = reorderedRoots
      .filter((item) => item.parentId === null)
      .sort((left, right) => left.order - right.order);

    expect(rootItems.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("rejects moving an item inside its own descendant", () => {
    const items = [
      makeItem({ id: "parent", nodeId: "node-parent", title: "Parent", order: 0 }),
      makeItem({ id: "child", nodeId: "node-child", title: "Child", parentId: "parent", order: 0 }),
    ];

    expect(() => moveCatalogItemInItems(items, "parent", { parentId: "child" })).toThrow(
      /own descendant/,
    );
  });

  it("finds items by node id and traverses in tree order", () => {
    const items = [
      makeItem({ id: "root-1", nodeId: "node-1", title: "1", order: 0 }),
      makeItem({ id: "root-2", nodeId: "node-2", title: "2", order: 1 }),
      makeItem({ id: "child-1", nodeId: "node-1-1", title: "1.1", parentId: "root-1", order: 0 }),
      makeItem({ id: "child-2", nodeId: "node-1-2", title: "1.2", parentId: "root-1", order: 1 }),
    ];

    expect(findCatalogItemByNodeId(items, "node-1-2")?.id).toBe("child-2");
    expect(traverseCatalogItems(items).map((item) => item.id)).toEqual([
      "root-1",
      "child-1",
      "child-2",
      "root-2",
    ]);
  });
});
