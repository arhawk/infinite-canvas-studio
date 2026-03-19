import { createIcons, Brush, Image, Link2, MousePointer2, Route } from "lucide";

const PROJECT_ICONS = {
  Brush,
  Image,
  Link2,
  MousePointer2,
  Route,
};

export function renderIcons(root, attrs = {}) {
  createIcons({
    icons: PROJECT_ICONS,
    attrs,
    root,
  });
}
