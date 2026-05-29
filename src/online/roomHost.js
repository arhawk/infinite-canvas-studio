import { RoomClient } from "./roomClient.js";
import { getCreateRoomApiUrl, getRoomWebSocketUrl } from "./roomRoute.js";

export async function createRoom({ password = "" } = {}) {
  const response = await fetch(getCreateRoomApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    if (response.status === 502) {
      const hostname = globalThis.window?.location?.hostname ?? "";
      const isLocal = (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]"
      );
      if (isLocal) {
        throw new Error(
          "Local room server is unreachable at 127.0.0.1:3001. Start it with `pnpm run server`.",
        );
      }
    }
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to create room (${response.status}).`);
  }

  return response.json();
}

export function createHostClient(roomId) {
  return new RoomClient({
    roomId,
    role: "host",
    getUrl: getRoomWebSocketUrl,
  });
}
