const PRESET_ID_SET = new Set(["title", "body", "note"]);

export const DEFAULT_TEXT_STYLE_PRESET_ID = "body";

export const TEXT_STYLE_PRESETS = [
  {
    id: "title",
    label: "Title",
    description: "Large bold heading",
    fontSize: 36,
    fontStyle: "700",
    fill: "#1d1b16",
  },
  {
    id: "body",
    label: "Body",
    description: "Standard paragraph",
    fontSize: 24,
    fontStyle: "400",
    fill: "#1d1b16",
  },
  {
    id: "note",
    label: "Note",
    description: "Subtle side comment",
    fontSize: 18,
    fontStyle: "400",
    fill: "#8a8175",
  },
];

function normalizeColor(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeTextFontStyle(value, fallback = "400") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

export function normalizeTextStylePresetId(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return PRESET_ID_SET.has(normalized) ? normalized : fallback;
}

export function getTextStylePreset(presetId = DEFAULT_TEXT_STYLE_PRESET_ID) {
  const normalized = normalizeTextStylePresetId(presetId, DEFAULT_TEXT_STYLE_PRESET_ID);
  return TEXT_STYLE_PRESETS.find((preset) => preset.id === normalized) ?? TEXT_STYLE_PRESETS[1];
}

export function buildTextStylePayload(presetId = DEFAULT_TEXT_STYLE_PRESET_ID) {
  const preset = getTextStylePreset(presetId);
  return {
    textStylePreset: preset.id,
    fontSize: preset.fontSize,
    fontStyle: preset.fontStyle,
    fill: preset.fill,
  };
}

export function inferTextStylePresetId(data = {}) {
  const fontSize = Number(data.fontSize);
  const fontStyle = normalizeTextFontStyle(data.fontStyle, "");
  const fill = normalizeColor(data.fill);
  const match = TEXT_STYLE_PRESETS.find((preset) => (
    preset.fontSize === fontSize &&
    normalizeTextFontStyle(preset.fontStyle, "") === fontStyle &&
    normalizeColor(preset.fill) === fill
  ));
  return match?.id ?? null;
}
