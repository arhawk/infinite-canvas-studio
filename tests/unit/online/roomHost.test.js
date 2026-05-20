import { afterEach, describe, expect, it, vi } from "vitest";

import { createCollab } from "../../../src/online/roomHost.js";

describe("roomHost create session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a local relay hint when localhost proxy returns 502", async () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        hostname: "localhost",
        host: "localhost:3000",
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: "Bad Gateway" }),
    })));

    await expect(createCollab({ password: "" })).rejects.toThrow(
      "Local room server is unreachable at 127.0.0.1:3001. Start it with `pnpm run server`.",
    );
  });
});
