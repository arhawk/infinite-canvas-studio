import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/attachments/openAttachment.js", () => ({
  setRuntimeAttachmentHandle: vi.fn(),
}));

import {
  bindProjectAttachmentRuntimeHandles,
  importProjectFromDirectoryHandle,
  isSafeRelativeAttachmentPath,
} from "../../../src/document/projectImport.js";
import { setRuntimeAttachmentHandle } from "../../../src/attachments/openAttachment.js";

function createSnapshot(path = "attachments/readme.txt") {
  return {
    schemaVersion: 1,
    documentId: "doc",
    revision: 1,
    nodes: [
      {
        id: "page-1",
        type: "page",
        data: {
          attachments: {
            entries: [
              {
                id: "att-1",
                kind: "local-file",
                fileName: "readme.txt",
                path,
                label: "readme.txt",
              },
            ],
          },
        },
      },
    ],
    drawings: [],
  };
}

describe("project import", () => {
  it("validates attachment path boundaries", () => {
    expect(isSafeRelativeAttachmentPath("attachments/a.txt")).toBe(true);
    expect(isSafeRelativeAttachmentPath("../a.txt")).toBe(false);
    expect(isSafeRelativeAttachmentPath("/tmp/a.txt")).toBe(false);
    expect(isSafeRelativeAttachmentPath("C:/tmp/a.txt")).toBe(false);
  });

  it("binds runtime handle for safe local-file entries", () => {
    const rootHandle = { kind: "directory", name: "project" };
    const { warnings, snapshot } = bindProjectAttachmentRuntimeHandles(createSnapshot(), rootHandle);
    expect(warnings).toEqual([]);
    expect(snapshot.nodes[0].data.attachments.entries[0].path).toBe("attachments/readme.txt");
    expect(setRuntimeAttachmentHandle).toHaveBeenCalledWith("att-1", rootHandle);
  });

  it("blocks unsafe attachment paths and records warning", () => {
    const rootHandle = { kind: "directory", name: "project" };
    const { warnings, snapshot } = bindProjectAttachmentRuntimeHandles(createSnapshot("../secret.txt"), rootHandle);
    const entry = snapshot.nodes[0].data.attachments.entries[0];
    expect(warnings).toHaveLength(1);
    expect(entry.path).toBe(null);
    expect(entry.url).toBe(null);
  });

  it("reads and parses project.json from directory handle", async () => {
    const snapshot = createSnapshot();
    const handle = {
      async getFileHandle(name) {
        expect(name).toBe("project.json");
        return {
          async getFile() {
            return {
              async text() {
                return JSON.stringify(snapshot);
              },
            };
          },
        };
      },
    };

    const result = await importProjectFromDirectoryHandle(handle);
    expect(result.warnings).toEqual([]);
    expect(result.snapshot.documentId).toBe("doc");
  });
});

