import { RoomClient } from "./roomClient.js";
import { getRoomWebSocketUrl } from "./roomRoute.js";

export async function createRoom({ password = "" } = {}) {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
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
