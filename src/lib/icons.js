import {
  Brush,
  Calculator,
  Download,
  Eraser,
  Image,
  Link2,
  MousePointer2,
  Redo2,
  Route,
  Timer,
  Undo2,
  Upload,
  createIcons,
} from "lucide";

const PROJECT_ICONS = {
  Brush,
  Calculator,
  Download,
  Eraser,
  Image,
  Link2,
  MousePointer2,
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
