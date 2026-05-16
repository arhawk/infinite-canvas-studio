import { RoomClient } from "./roomClient.js";
import { getRoomWebSocketUrl } from "./roomRoute.js";

export function createViewerClient(roomId) {
  return new RoomClient({
    roomId,
    role: "viewer",
    getUrl: getRoomWebSocketUrl,
  });
}
