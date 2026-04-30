export const SHAPE_TYPES = [
  { value: "rectangle", label: "Rectangle" },
  { value: "oval", label: "Oval / Circle" },
  { value: "rhombus", label: "Rhombus" },
  { value: "triangle", label: "Triangle" },
  { value: "line", label: "Divider / Line" },
];

export const DEFAULT_SHAPE_WIDTH = 160;
export const DEFAULT_SHAPE_HEIGHT = 96;
export const DEFAULT_SHAPE_LINE_HEIGHT = 18;
export const MIN_SHAPE_WIDTH = 24;
export const MIN_SHAPE_HEIGHT = 24;
export const MIN_SHAPE_LINE_HEIGHT = 12;
export const DEFAULT_SHAPE_FILL = "#ffffff";
export const DEFAULT_SHAPE_FILL_OPACITY = 0;
export const DEFAULT_SHAPE_STROKE = "#000000";
export const DEFAULT_SHAPE_TEXT_COLOR = "#2d2d2d";
export const DEFAULT_SHAPE_FONT_SIZE = 18;

export function normalizeShapeType(value) {
  return SHAPE_TYPES.some((entry) => entry.value === value) ? value : "rectangle";
}
