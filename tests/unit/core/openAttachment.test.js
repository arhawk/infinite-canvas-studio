import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/attachments/handleStore.js", () => ({
  loadHandleRecord: vi.fn(),
}));

import { loadHandleRecord } from "../../../src/attachments/handleStore.js";
import { openAttachmentEntry } from "../../../src/attachments/openAttachment.js";

describe("openAttachmentEntry", () => {
  let openSpy;
  let createObjectUrlSpy;
  let revokeObjectUrlSpy;
  let alertSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => "";
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {};
    }
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("opens text-like attachments as utf-8 html preview", async () => {
    const file = new File(["学习成长\n- computer"], "notes.txt", { type: "text/plain" });
    file.arrayBuffer = vi.fn(async () => new TextEncoder().encode("学习成长\n- computer").buffer);
    loadHandleRecord.mockResolvedValue({ handle: file });

    const ok = await openAttachmentEntry(
      {
        id: "att-1",
        kind: "local-file",
        handleKey: "h1",
      },
      { directory: null, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(true);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectUrlSpy.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toContain("text/html");
    expect(openSpy).toHaveBeenCalledWith("blob:test", "_blank", "noopener,noreferrer");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();
  });

  it("opens binary attachments as raw blob url", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const file = new File([bytes], "image.png", { type: "image/png" });
    loadHandleRecord.mockResolvedValue({ handle: file });

    const ok = await openAttachmentEntry(
      {
        id: "att-2",
        kind: "local-file",
        handleKey: "h2",
      },
      { directory: null, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(true);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy.mock.calls[0][0]).toBe(file);
    expect(openSpy).toHaveBeenCalledWith("blob:test", "_blank", "noopener,noreferrer");
  });

  it("opens url attachment directly", async () => {
    const ok = await openAttachmentEntry(
      {
        id: "att-url",
        kind: "url",
        sourceKind: "url",
        label: "Docs",
        url: "https://example.com/docs",
      },
      { directory: null, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(true);
    expect(openSpy).toHaveBeenCalledWith("https://example.com/docs", "_blank", "noopener,noreferrer");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("opens local attachment by relative url", async () => {
    const ok = await openAttachmentEntry(
      {
        id: "att-relative-url",
        kind: "local-file",
        sourceKind: "directory",
        label: "untitled-r1.html",
        path: "untitled-r1.html",
        url: "./untitled-r1.html",
      },
      { directory: { name: "Downloads" }, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(true);
    expect(openSpy).toHaveBeenCalledWith("./untitled-r1.html", "_blank", "noopener,noreferrer");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("falls back to derived relative path for legacy entries", async () => {
    loadHandleRecord.mockResolvedValue(null);
    const ok = await openAttachmentEntry(
      {
        id: "att-legacy-path",
        kind: "local-file",
        sourceKind: "directory",
        label: "outline.md",
        fileName: "outline.md",
        path: "projects/outline.md",
      },
      { directory: { name: "DemoFolder" }, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(true);
    expect(openSpy).toHaveBeenCalledWith("./projects/outline.md", "_blank", "noopener,noreferrer");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("alerts with details when no url/path/filename and no local object", async () => {
    loadHandleRecord.mockResolvedValue(null);
    const showStatus = vi.fn();

    const ok = await openAttachmentEntry(
      {
        id: "att-missing",
        kind: "local-file",
        sourceKind: "directory",
        label: "outline.md",
        sourceName: "DemoFolder",
      },
      { directory: { name: "DemoFolder" }, entries: [] },
      showStatus,
    );

    expect(ok).toBe(false);
    expect(showStatus).toHaveBeenCalledWith(
      "缺少可用链接或本地对象，请重新添加附件或重新选择目录/文件。",
      "error",
    );
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = alertSpy.mock.calls[0][0];
    expect(message).toContain("尝试访问目标");
    expect(message).toContain("原始路径: DemoFolder");
  });

  it("alerts readable error for legacy handleKey-only entries", async () => {
    loadHandleRecord.mockResolvedValue(null);
    const ok = await openAttachmentEntry(
      {
        id: "att-legacy",
        kind: "local-file",
        handleKey: "legacy-only",
      },
      { directory: null, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(false);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(String(alertSpy.mock.calls[0][0])).toContain("缺少可用链接或本地对象");
  });
});
