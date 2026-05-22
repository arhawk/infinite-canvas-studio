import { RoomClient } from "./roomClient.js";
import { getRoomWebSocketUrl } from "./roomRoute.js";

export function createViewerClient(roomId) {
  return new RoomClient({
    roomId,
    role: "viewer",
    getUrl: (id, role) => getRoomWebSocketUrl(id, role, window.location),
  });
}
