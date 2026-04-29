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

  beforeEach(() => {
    vi.restoreAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => "";
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {};
    }
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
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
        fileName: "notes.txt",
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
        fileName: "image.png",
      },
      { directory: null, entries: [] },
      vi.fn(),
    );

    expect(ok).toBe(true);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy.mock.calls[0][0]).toBe(file);
    expect(openSpy).toHaveBeenCalledWith("blob:test", "_blank", "noopener,noreferrer");
  });
});
