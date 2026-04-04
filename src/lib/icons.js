import {
  Calculator,
  Download,
  Eraser,
  Highlighter,
  Image,
  Link2,
  MousePointer2,
  Pen,
  Pencil,
  Redo2,
  Route,
  Timer,
  Undo2,
  Upload,
  createIcons,
} from "lucide";

const PROJECT_ICONS = {
  Calculator,
  Download,
  Eraser,
  Highlighter,
  Image,
  Link2,
  MousePointer2,
  Pen,
  Pencil,
  Redo2,
  Route,
  Timer,
  Undo2,
  Upload,
};

export function renderIcons(root, attrs = {}) {
  createIcons({
    icons: PROJECT_ICONS,
    attrs,
    root,
  });
}
