import { createIcons, Brush, Image, Link2, MousePointer2 } from "lucide";

const PROJECT_ICONS = {
  Brush,
  Image,
  Link2,
  MousePointer2,
};

export function renderIcons(root, attrs = {}) {
  createIcons({
    icons: PROJECT_ICONS,
    attrs,
    root,
  });
}
