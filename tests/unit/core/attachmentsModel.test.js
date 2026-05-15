import { describe, expect, it } from "vitest";
import {
  appendAttachmentEntries,
  normalizeAttachmentEntry,
  normalizeAttachmentState,
  replaceDirectoryEntries,
} from "../../../src/attachments/model.js";

describe("attachment model helpers", () => {
  it("normalizes empty state", () => {
    expect(normalizeAttachmentState()).toEqual({
      directory: null,
      entries: [],
    });
  });

  it("replaces directory entries without removing dropped files or urls", () => {
    const initial = normalizeAttachmentState({
      directory: {
        handleKey: "dir-old",
        name: "Old",
      },
      entries: [
        {
          id: "old-dir",
          kind: "local-file",
          sourceKind: "directory",
          label: "slide.pdf",
          fileName: "slide.pdf",
          path: "slide.pdf",
          handleKey: "dir-old",
        },
        {
          id: "dropped-file",
          kind: "local-file",
          sourceKind: "file",
          label: "draft.txt",
          fileName: "draft.txt",
          path: "draft.txt",
          handleKey: "file-1",
        },
      ],
    });

    const replaced = replaceDirectoryEntries(
      initial,
      {
        handleKey: "dir-new",
        name: "Week 2",
      },
      [
        {
          id: "new-dir",
          kind: "local-file",
          sourceKind: "directory",
          label: "notes.md",
          fileName: "notes.md",
          path: "notes.md",
          handleKey: "dir-new",
        },
      ],
    );

    expect(replaced.directory).toEqual({
      handleKey: "dir-new",
      name: "Week 2",
      path: null,
      sourceName: null,
      url: null,
    });
    expect(replaced.entries.map((entry) => entry.id)).toEqual(["dropped-file", "new-dir"]);
  });

  it("appends dropped url entries", () => {
    const next = appendAttachmentEntries(null, [
      {
        id: "url-1",
        kind: "url",
        url: "https://example.com",
      },
    ]);

    expect(next.entries[0]).toMatchObject({
      id: "url-1",
      kind: "url",
      sourceKind: "url",
      url: "https://example.com",
      label: "example.com",
    });
  });

  it("normalizes new attachment metadata fields", () => {
    const normalized = normalizeAttachmentEntry({
      kind: "local-file",
      sourceKind: "upload",
      fileName: "demo.txt",
      path: "docs/demo.txt",
      url: "./docs/demo.txt",
      sourceName: "Workspace",
      mimeType: "text/plain",
      size: 12,
      addedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(normalized).toMatchObject({
      kind: "local-file",
      sourceKind: "upload",
      fileName: "demo.txt",
      path: "docs/demo.txt",
      url: "./docs/demo.txt",
      sourceName: "Workspace",
      mimeType: "text/plain",
      size: 12,
      addedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("keeps directory metadata even when handleKey is missing", () => {
    const state = normalizeAttachmentState({
      directory: {
        name: "DemoFolder",
        sourceName: "DemoFolder",
        path: "projects",
      },
      entries: [],
    });

    expect(state.directory).toEqual({
      name: "DemoFolder",
      sourceName: "DemoFolder",
      path: "projects",
      url: null,
      handleKey: null,
    });
  });
});
