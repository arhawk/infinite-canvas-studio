import { describe, expect, it } from "vitest";
import {
  getNodeDisplayTitle,
  getUniqueCatalogTitle,
  resolveCatalogTargetNode,
} from "../../../src/plugins/catalogActions.js";
import { removeCatalogItemPromoteChildrenInItems } from "../../../src/plugins/catalogPanel.js";

function makeCatalogItem({
  id,
  nodeId,
  title,
  parentId = null,
  order = 0,
}) {
  return {
    id,
    nodeId,
    title,
    titleSource: "node",
    parentId,
    order,
    collapsed: false,
  };
}

function createMockNode({
  componentType,
  attrs = {},
  ancestors = {},
  textNodes = {},
} = {}) {
  return {
    getStage: () => ({ id: "stage" }),
    getAttr(key) {
      if (key === "componentType") return componentType;
      return attrs[key];
    },
    findAncestor(selector) {
      return ancestors[selector] ?? null;
    },
    findOne(selector) {
      const entry = textNodes[selector];
      if (entry == null) return null;
      if (typeof entry === "object") return entry;
      return {
        text: () => entry,
      };
    },
  };
}

describe("catalog outline helpers", () => {
  it("resolves page-contained nodes to their page but leaves standalone nodes alone", () => {
    const pageNode = createMockNode({ componentType: "page" });
    const childNode = createMockNode({
      componentType: "shape",
      ancestors: {
        ".page-root": pageNode,
      },
    });
    const stickyNode = createMockNode({ componentType: "sticky" });

    expect(resolveCatalogTargetNode(pageNode)).toBe(pageNode);
    expect(resolveCatalogTargetNode(childNode)).toBe(pageNode);
    expect(resolveCatalogTargetNode(stickyNode)).toBe(stickyNode);
  });

  it("derives readable titles for video and unnamed shapes", () => {
    const videoNode = createMockNode({
      componentType: "video",
      attrs: { videoTitle: "Intro Clip" },
    });
    const unnamedShapeNode = createMockNode({
      componentType: "shape",
      attrs: { shapeType: "triangle" },
      textNodes: {
        ".shape-text": "",
      },
    });

    expect(getNodeDisplayTitle(videoNode)).toBe("Intro Clip");
    expect(getNodeDisplayTitle(unnamedShapeNode)).toBe("Triangle");
  });

  it("increments default shape titles to keep unnamed shapes distinguishable", () => {
    const shapeNode = createMockNode({
      componentType: "shape",
      attrs: { shapeType: "rectangle" },
      textNodes: {
        ".shape-text": "",
      },
    });

    const items = [
      makeCatalogItem({ id: "a", nodeId: "node-a", title: "Rectangle" }),
      makeCatalogItem({ id: "b", nodeId: "node-b", title: "Rectangle 2" }),
    ];

    expect(getUniqueCatalogTitle(shapeNode, items)).toBe("Rectangle 3");
  });

  it("removes an outline item while promoting its direct children into its slot", () => {
    const items = [
      makeCatalogItem({ id: "root-a", nodeId: "page-a", title: "Page A", order: 0 }),
      makeCatalogItem({ id: "child-a1", nodeId: "node-a1", title: "A1", parentId: "root-a", order: 0 }),
      makeCatalogItem({ id: "child-a2", nodeId: "node-a2", title: "A2", parentId: "root-a", order: 1 }),
      makeCatalogItem({ id: "root-b", nodeId: "page-b", title: "Page B", order: 1 }),
    ];

    const nextItems = removeCatalogItemPromoteChildrenInItems(items, "root-a")
      .filter((item) => item.parentId === null)
      .sort((left, right) => left.order - right.order);

    expect(nextItems.map((item) => [item.id, item.order])).toEqual([
      ["child-a1", 0],
      ["child-a2", 1],
      ["root-b", 2],
    ]);
  });
});
