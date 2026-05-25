export const ROOM_BACKEND_HOST = "au.baitian.moe:3001";

function isLocalDevHost(locationRef = window.location) {
  const hostname = locationRef.hostname ?? "";
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function getRoomBackendHost(locationRef = window.location) {
  const overrideHost = globalThis.window?.__ROOM_BACKEND_HOST__;
  if (overrideHost) {
    return overrideHost;
  }

  if (isLocalDevHost(locationRef) && locationRef.host) {
    return locationRef.host;
  }

  return ROOM_BACKEND_HOST;
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
  return `${protocol}//${getRoomBackendHost(locationRef)}/ws/rooms/${roomId}?role=${encodeURIComponent(role)}`;
}

export function getCreateRoomApiUrl(locationRef = window.location) {
  const protocol = locationRef.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${getRoomBackendHost(locationRef)}/api/rooms`;
}
