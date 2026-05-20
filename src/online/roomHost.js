import { RoomClient } from "./roomClient.js";
import { getCreateRoomApiUrl, getRoomWebSocketUrl } from "./roomRoute.js";

export async function createRoom({ password = "" } = {}) {
  return createSession({ password, sessionType: "room" });
}

export async function createCollab({ password = "" } = {}) {
  return createSession({ password, sessionType: "collab" });
}

async function createSession({ password = "", sessionType = "room" } = {}) {
  const url = getCreateRoomApiUrl(window.location, sessionType);
  const isLocalFrontendHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  const localBackendHint = "Local room server is unreachable at 127.0.0.1:3001. Start it with `pnpm run server`.";
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
  } catch (error) {
    if (isLocalFrontendHost) {
      throw new Error(localBackendHint);
    }
    throw new Error(error instanceof Error ? error.message : "Failed to create room.");
  }

  if (!response.ok) {
    if (response.status === 502 && isLocalFrontendHost) {
      throw new Error(localBackendHint);
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
    getUrl: (id, role) => getRoomWebSocketUrl(id, role, window.location, "room"),
  });
}

export function createCollabHostClient(roomId) {
  return new RoomClient({
    roomId,
    role: "host",
    getUrl: (id, role) => getRoomWebSocketUrl(id, role, window.location, "collab"),
  });
}
