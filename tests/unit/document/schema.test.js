import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SCHEMA_VERSION,
  normalizeDocumentSnapshot,
} from "../../../src/document/schema.js";

describe("document schema", () => {
  it("normalizes a valid document snapshot with defaults", () => {
    const normalized = normalizeDocumentSnapshot({
      documentId: "document-1",
      nodes: [
        {
          id: "sticky-1",
          type: "sticky",
          data: {
            text: "hello",
          },
        },
      ],
    });

    expect(normalized).toMatchObject({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      documentId: "document-1",
      revision: 0,
      meta: {
        title: "Untitled",
      },
      view: {
        scale: 1,
        position: {
          x: 0,
          y: 0,
        },
      },
    });
    expect(normalized.nodes[0]).toMatchObject({
      id: "sticky-1",
      type: "sticky",
      zIndex: 0,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      opacity: 1,
      data: {
        text: "hello",
      },
    });
  });

  it("rejects unsupported schema versions", () => {
    expect(() => normalizeDocumentSnapshot({
      schemaVersion: 99,
      documentId: "document-1",
    })).toThrow(/Unsupported document schema version/);
  });

  it("rejects duplicate node ids", () => {
    expect(() => normalizeDocumentSnapshot({
      documentId: "document-1",
      nodes: [
        { id: "sticky-1", type: "sticky" },
        { id: "sticky-1", type: "text" },
      ],
    })).toThrow(/Duplicate node id/);
  });
});
