export function getRoomIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname ?? "").match(/^\/room\/(\d{4})\/?$/);
  return match?.[1] ?? null;
}

export function getShareUrl(roomId, origin = window.location.origin) {
  return `${origin}/room/${roomId}`;
}

export function getRoomWebSocketUrl(roomId, role, locationRef = window.location) {
  const protocol = locationRef.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${locationRef.host}/ws/rooms/${roomId}?role=${encodeURIComponent(role)}`;
}
