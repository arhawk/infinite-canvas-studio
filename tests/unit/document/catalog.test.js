import { describe, it, expect } from "vitest";
import { normalizeDocumentSnapshot } from "../../../src/document/schema.js";

describe("catalog document structure", () => {
  it("keeps catalog items inside catalog node data", () => {
    const snapshot = normalizeDocumentSnapshot({
      documentId: "doc-1",
      nodes: [
        {
          id: "catalog-1",
          type: "catalog",
          x: 0,
          y: 0,
          data: {
            version: 1,
            title: "Catalog",
            items: [
              {
                id: "item-1",
                nodeId: "text-1",
                title: "New idea",
                parentId: null,
                order: 0,
                collapsed: false,
              },
            ],
          },
        },
      ],
      drawings: [],
    });

    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0].type).toBe("catalog");
    expect(snapshot.nodes[0].data).toEqual({
      version: 1,
      title: "Catalog",
      items: [
        {
          id: "item-1",
          nodeId: "text-1",
          title: "New idea",
          parentId: null,
          order: 0,
          collapsed: false,
        },
      ],
    });
  });

  it("allows an empty catalog items list", () => {
    const snapshot = normalizeDocumentSnapshot({
      documentId: "doc-2",
      nodes: [
        {
          id: "catalog-1",
          type: "catalog",
          x: 0,
          y: 0,
          data: {
            version: 1,
            title: "Catalog",
            items: [],
          },
        },
      ],
      drawings: [],
    });

    expect(snapshot.nodes[0].data).toEqual({
      version: 1,
      title: "Catalog",
      items: [],
    });
  });
});