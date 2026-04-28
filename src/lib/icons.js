import {
  Calculator,
  Crosshair,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Highlighter,
  Image,
  Link2,
  LayoutGrid,
  MousePointer2,
  Pen,
  Pencil,
  Redo2,
  Route,
  TextCursor,
  Timer,
  Trash2,
  Undo2,
  Upload,
  createIcons,
} from "lucide";

const PROJECT_ICONS = {
  Calculator,
  Crosshair,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Highlighter,
  Image,
  Link2,
  LayoutGrid,
  MousePointer2,
  Pen,
  Pencil,
  Redo2,
  Route,
  TextCursor,
  Timer,
  Trash2,
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
