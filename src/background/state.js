import { CANVAS_THEME_IDS } from "../theme/canvasTheme.js";

export const BACKGROUND_TYPES = {
  BLANK: "blank",
  SOLID: "solid",
  GRID: "grid",
  DOT: "dot",
  WARM_PAPER: "warm-paper",
};

export const DEFAULT_BACKGROUND_STATE = {
  type: BACKGROUND_TYPES.GRID,
  color: "#f7f3ea",
  opacity: 1,
  themeId: CANVAS_THEME_IDS.default,
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

function inferThemeIdFromState(state = {}) {
  const color = normalizeHexColor(state.color);
  return color === "#ffffff"
    ? CANVAS_THEME_IDS.colorful
    : CANVAS_THEME_IDS.default;
}

function normalizeThemeId(value, state = {}) {
  if (value === CANVAS_THEME_IDS.colorful) return CANVAS_THEME_IDS.colorful;
  if (value === CANVAS_THEME_IDS.default) return CANVAS_THEME_IDS.default;
  return inferThemeIdFromState(state);
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
    themeId: normalizeThemeId(source.themeId, source),
  };
}

export function cloneBackgroundState(state = {}) {
  return normalizeBackgroundState(state);
}
