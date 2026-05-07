export const ROOM_BACKEND_HOST = "au.baitian.moe:3001";

function getRoomBackendHost() {
  return window.__ROOM_BACKEND_HOST__ || ROOM_BACKEND_HOST;
}

export function getRoomIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname ?? "").match(/^\/room\/(\d{4})\/?$/);
  return match?.[1] ?? null;
}

export function getShareUrl(roomId, origin = window.location.origin) {
  return `${origin}/room/${roomId}`;
}

export function getRoomWebSocketUrl(roomId, role, locationRef = window.location) {
  const protocol = locationRef.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${getRoomBackendHost()}/ws/rooms/${roomId}?role=${encodeURIComponent(role)}`;
}

export function getCreateRoomApiUrl(locationRef = window.location) {
  const protocol = locationRef.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${getRoomBackendHost()}/api/rooms`;
}
