import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../src/attachments/handleStore.js", () => ({
  loadHandleRecord: vi.fn(async () => null),
}));

vi.mock("../../../src/attachments/openAttachment.js", () => ({
  getRuntimeAttachmentHandleById: vi.fn(() => null),
}));

import { exportDocumentAsProject, isProjectExportSupported } from "../../../src/document/projectExport.js";
import { loadHandleRecord } from "../../../src/attachments/handleStore.js";
import { getRuntimeAttachmentHandleById } from "../../../src/attachments/openAttachment.js";

function createWritableStore(target) {
  return {
    async write(value) {
      target.value = value;
    },
    async close() {},
  };
}

function createFileHandle(file) {
  return {
    kind: "file",
    async getFile() {
      return file;
    },
  };
}

function createDirectory(entries = {}) {
  const files = new Map();
  const dirs = new Map();

  Object.entries(entries).forEach(([key, value]) => {
    if (value?.kind === "directory") {
      dirs.set(key, value);
    } else {
      files.set(key, { value: value ?? null });
    }
  });

  return {
    kind: "directory",
    name: "mock-dir",
    async getDirectoryHandle(name, { create } = {}) {
      if (dirs.has(name)) return dirs.get(name);
      if (!create) throw new Error(`Missing directory: ${name}`);
      const next = createDirectory();
      next.name = name;
      dirs.set(name, next);
      return next;
    },
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name)) {
        if (!create) throw new Error(`Missing file: ${name}`);
        files.set(name, { value: null });
      }
      const record = files.get(name);
      return {
        kind: "file",
        name,
        async getFile() {
          return record.value;
        },
        async createWritable() {
          return createWritableStore(record);
        },
      };
    },
    __files: files,
    __dirs: dirs,
  };
}

function createSnapshot() {
  return {
    schemaVersion: 1,
    documentId: "doc-1",
    revision: 1,
    meta: { title: "Demo" },
    view: {
      scale: 1,
      position: { x: 0, y: 0 },
    },
    background: {},
    nodes: [
      {
        id: "page-1",
        type: "page",
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        opacity: 1,
        data: {
          label: "Page",
          attachments: {
            directory: null,
            entries: [
              {
                id: "entry-1",
                kind: "local-file",
                sourceKind: "file",
                fileName: "notes.txt",
                path: "notes.txt",
                label: "notes.txt",
                handleKey: "k1",
              },
              {
                id: "entry-2",
                kind: "local-file",
                sourceKind: "file",
                fileName: "notes.txt",
                path: "notes.txt",
                label: "notes-2.txt",
                handleKey: "k2",
              },
            ],
          },
        },
      },
    ],
    drawings: [],
  };
}

describe("project export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rewrites attachment url/path and writes project files", async () => {
    const rootDir = createDirectory();
    const firstFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    const secondFile = new File(["world"], "notes.txt", { type: "text/plain" });

    vi.mocked(loadHandleRecord)
      .mockResolvedValueOnce({ handle: createFileHandle(firstFile) })
      .mockResolvedValueOnce({ handle: createFileHandle(secondFile) });

    window.showDirectoryPicker = vi.fn(async () => rootDir);

    const result = await exportDocumentAsProject({
      snapshot: createSnapshot(),
      title: "Demo",
      suggestedBase: "mind-map-r1",
      htmlTemplate: "<!doctype html><html><head><title>App</title></head><body><div id='app'></div></body></html>",
    });

    expect(result.warnings).toEqual([]);
    const entries = result.snapshot.nodes[0].data.attachments.entries;
    expect(entries[0].url).toBe("./attachments/notes.txt");
    expect(entries[0].path).toBe("attachments/notes.txt");
    expect(entries[1].url).toBe("./attachments/notes-2.txt");
    expect(entries[1].path).toBe("attachments/notes-2.txt");

    const projectDir = rootDir.__dirs.get(result.folderName);
    expect(projectDir).toBeTruthy();
    expect(projectDir.__files.get("index.html").value).toContain('id="app-snapshot"');
    expect(projectDir.__files.get("project.json").value).toContain('"attachments/notes.txt"');
    const attachmentsDir = projectDir.__dirs.get("attachments");
    expect(attachmentsDir.__files.get("notes.txt").value).toBe(firstFile);
    expect(attachmentsDir.__files.get("notes-2.txt").value).toBe(secondFile);
    expect(result.renamedAttachments).toEqual([
      { id: "entry-2", from: "notes.txt", to: "notes-2.txt" },
    ]);
  });

  it("returns unsupported when File System Access API is unavailable", () => {
    const original = window.showDirectoryPicker;
    delete window.showDirectoryPicker;
    expect(isProjectExportSupported()).toBe(false);
    window.showDirectoryPicker = original;
  });

  it("continues export and reports warnings when attachment handle is missing", async () => {
    const rootDir = createDirectory();
    window.showDirectoryPicker = vi.fn(async () => rootDir);
    vi.mocked(getRuntimeAttachmentHandleById).mockReturnValue(null);
    vi.mocked(loadHandleRecord).mockResolvedValue(null);

    const result = await exportDocumentAsProject({
      snapshot: createSnapshot(),
      title: "Demo",
      suggestedBase: "mind-map-r1",
      htmlTemplate: "<!doctype html><html><head><title>App</title></head><body><div id='app'></div></body></html>",
    });

    expect(result.warnings).toHaveLength(2);
    const entries = result.snapshot.nodes[0].data.attachments.entries;
    expect(entries[0].url ?? null).toBe(null);
    const projectDir = rootDir.__dirs.get(result.folderName);
    expect(projectDir.__files.get("index.html").value).toContain('id="app-snapshot"');
    expect(projectDir.__dirs.get("attachments").__files.size).toBe(0);
  });
});
