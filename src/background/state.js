export const BACKGROUND_TYPES = {
  BLANK: "blank",
  SOLID: "solid",
  GRID: "grid",
  WARM_PAPER: "warm-paper",
};

export const DEFAULT_BACKGROUND_STATE = {
  type: BACKGROUND_TYPES.GRID,
  color: "#f7f3ea",
  opacity: 1,
};

function normalizeHexColor(value, fallback = DEFAULT_BACKGROUND_STATE.color) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function normalizeOpacity(value, fallback = DEFAULT_BACKGROUND_STATE.opacity) {
  if (value == null) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.min(1, numericValue));
}

export function normalizeBackgroundState(state = {}) {
  const source = state && typeof state === "object" ? state : {};
  const type = Object.values(BACKGROUND_TYPES).includes(source.type)
    ? source.type
    : DEFAULT_BACKGROUND_STATE.type;

  return {
    type,
    color: normalizeHexColor(source.color),
    opacity: normalizeOpacity(source.opacity),
  };
}

export function cloneBackgroundState(state = {}) {
  return normalizeBackgroundState(state);
}
