import {
  Brush,
  Image,
  Link2,
  MousePointer2,
  Redo2,
  Route,
  Undo2,
  createIcons,
} from "lucide";

const PROJECT_ICONS = {
  Brush,
  Image,
  Link2,
  MousePointer2,
  Redo2,
  Route,
  Undo2,
};

export function renderIcons(root, attrs = {}) {
  createIcons({
    icons: PROJECT_ICONS,
    attrs,
    root,
  });
}
