export const CANVAS_THEME_IDS = {
  default: "default",
  colorful: "colorful",
};

export const CANVAS_THEME_DEFAULTS = {
  [CANVAS_THEME_IDS.default]: {
    eraser: {
      stroke: "rgba(215, 97, 47, 0.95)",
      fill: "rgba(215, 97, 47, 0.12)",
    },
    connection: {
      stroke: "#d7612f",
    },
    connectionHandle: {
      fill: "#fffaf2",
      stroke: "#d7612f",
      shadowColor: "rgba(54, 41, 25, 0.18)",
    },
    page: {
      fill: "#fffdf8",
      stroke: "#c9b393",
      labelColor: "#ab4f28",
      headerLineStroke: "rgba(171, 79, 40, 0.12)",
      shadowColor: "rgba(54, 41, 25, 0.16)",
    },
    sticky: {
      fill: "#ffe082",
      textColor: "#47361c",
      shadowColor: "rgba(54, 41, 25, 0.2)",
    },
    button: {
      fill: "#f7e7c6",
      stroke: "#b9782f",
      textColor: "#5b3b12",
      shadowColor: "rgba(54, 41, 25, 0.16)",
    },
    image: {
      fill: "#fdf8f3",
      stroke: "#dcc7b1",
      textColor: "#a68b6d",
    },
    iframe: {
      fill: "#fffdf8",
      stroke: "#dcc7b1",
      headerLineStroke: "rgba(171, 79, 40, 0.12)",
      placeholderColor: "#8d7760",
      shadowColor: "rgba(54, 41, 25, 0.1)",
    },
    video: {
      fill: "#fdf8f3",
      stroke: "#dcc7b1",
      bodyFill: "#1a1a2e",
      placeholderColor: "#a68b6d",
    },
    javascriptEditor: {
      fill: "#fffdf8",
      stroke: "rgba(61, 47, 32, 0.12)",
      dividerStroke: "rgba(61, 47, 32, 0.1)",
      titleColor: "#d7612f",
      editorFill: "#fffdf8",
      editorStroke: "rgba(61, 47, 32, 0.1)",
      cursorStroke: "rgba(215, 97, 47, 0.16)",
      codeLineStrokes: [
        "rgba(44, 117, 67, 0.42)",
        "rgba(61, 47, 32, 0.16)",
        "rgba(181, 76, 66, 0.28)",
        "rgba(61, 47, 32, 0.14)",
      ],
      splitterFill: "rgba(61, 47, 32, 0.12)",
      outputFill: "rgba(255, 255, 255, 0.72)",
      tabFill: "rgba(61, 47, 32, 0.06)",
      hintColor: "#8d7760",
      shadowColor: "rgba(54, 41, 25, 0.1)",
      previewBackground: "#fcfaf6",
      previewTextColor: "#7b6551",
      runtimeBackground: "#fffdf9",
      runtimeTextColor: "#2f2419",
    },
    rankingBox: {
      themeColor: "#8a6f47",
      titleColor: "#5f4828",
    },
    snapGuide: {
      stroke: "#d7612f",
    },
    buttonConnection: {
      stroke: "#d7612f",
    },
  },
  [CANVAS_THEME_IDS.colorful]: {
    eraser: {
      stroke: "rgba(52, 211, 153, 0.95)",
      fill: "rgba(52, 211, 153, 0.12)",
    },
    connection: {
      stroke: "#45D6D6",
    },
    connectionHandle: {
      fill: "#eafaff",
      stroke: "#45D6D6",
      shadowColor: "rgba(69, 214, 214, 0.22)",
    },
    page: {
      fill: "#ffffff",
      stroke: "#a78bfa",
      labelColor: "#6d28d9",
      headerLineStroke: "rgba(109, 40, 217, 0.14)",
      shadowColor: "rgba(76, 29, 149, 0.12)",
    },
    sticky: {
      fill: "#dbeafe",
      textColor: "#1e3a8a",
      shadowColor: "rgba(29, 78, 216, 0.16)",
    },
    button: {
      fill: "#F8ECF5",
      stroke: "#D4537E",
      textColor: "#D4537E",
      shadowColor: "rgba(212, 83, 126, 0.14)",
    },
    image: {
      fill: "#ffffff",
      stroke: "#ddd6fe",
      textColor: "#64748b",
    },
    iframe: {
      fill: "#ffffff",
      stroke: "#ddd6fe",
      headerLineStroke: "rgba(109, 40, 217, 0.12)",
      placeholderColor: "#64748b",
      shadowColor: "rgba(76, 29, 149, 0.1)",
    },
    video: {
      fill: "#ffffff",
      stroke: "#ddd6fe",
      bodyFill: "#0f172a",
      placeholderColor: "#94a3b8",
    },
    javascriptEditor: {
      fill: "#ffffff",
      stroke: "rgba(109, 40, 217, 0.28)",
      dividerStroke: "rgba(109, 40, 217, 0.12)",
      titleColor: "#7f77dd",
      editorFill: "#ffffff",
      editorStroke: "rgba(109, 40, 217, 0.12)",
      cursorStroke: "rgba(109, 40, 217, 0.2)",
      codeLineStrokes: [
        "rgba(139, 92, 246, 0.36)",
        "rgba(51, 65, 85, 0.14)",
        "rgba(109, 40, 217, 0.24)",
        "rgba(51, 65, 85, 0.12)",
      ],
      splitterFill: "rgba(109, 40, 217, 0.16)",
      outputFill: "rgba(255, 255, 255, 0.78)",
      tabFill: "rgba(109, 40, 217, 0.08)",
      hintColor: "#64748b",
      shadowColor: "rgba(76, 29, 149, 0.1)",
      previewBackground: "#ffffff",
      previewTextColor: "#64748b",
      runtimeBackground: "#ffffff",
      runtimeTextColor: "#102033",
    },
    rankingBox: {
      themeColor: "#7f77dd",
      titleColor: "#3c2d95",
    },
    snapGuide: {
      stroke: "#34d399",
    },
    buttonConnection: {
      stroke: "#D4537E",
    },
    buttonConnectionPreview: {
      stroke: "#EC86A8",
    },
  },
};

export function getCurrentCanvasThemeId() {
  if (typeof document === "undefined") return CANVAS_THEME_IDS.default;
  return document.body.classList.contains("theme-colorful")
    ? CANVAS_THEME_IDS.colorful
    : CANVAS_THEME_IDS.default;
}

export function getCanvasTheme(themeId = getCurrentCanvasThemeId()) {
  return CANVAS_THEME_DEFAULTS[themeId] ?? CANVAS_THEME_DEFAULTS[CANVAS_THEME_IDS.default];
}

function normalizeColorValue(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function colorMatches(actual, expected) {
  return normalizeColorValue(actual) === normalizeColorValue(expected);
}

function isDefaultThemeColor(actual, fromColor, toColor) {
  return colorMatches(actual, fromColor) || colorMatches(actual, toColor);
}

function colorWithOpacity(color, opacity = 1) {
  const alpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  if (alpha >= 1) return color;

  const hex = typeof color === "string" ? color.trim() : "";
  const shortMatch = hex.match(/^#([0-9a-f]{3})$/i);
  const longMatch = hex.match(/^#([0-9a-f]{6})$/i);
  const digits = shortMatch
    ? shortMatch[1].split("").map((char) => `${char}${char}`).join("")
    : longMatch?.[1] ?? null;
  if (!digits) return color;

  const red = Number.parseInt(digits.slice(0, 2), 16);
  const green = Number.parseInt(digits.slice(2, 4), 16);
  const blue = Number.parseInt(digits.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function setNodeColorIfDefault(node, getter, setter, fromColor, toColor) {
  const current = getter(node);
  if (!isDefaultThemeColor(current, fromColor, toColor)) return false;
  setter(node, toColor);
  return true;
}

function retintPage(node, from, to) {
  const rect = node.findOne?.(".container-bg");
  const label = node.findOne?.(".container-label");
  const header = node.findOne?.(".page-header-line");
  const fillOpacity = Number.isFinite(node.getAttr?.("pageFillOpacity"))
    ? node.getAttr("pageFillOpacity")
    : 1;

  if (isDefaultThemeColor(node.getAttr?.("pageFill") ?? rect?.fill?.(), from.fill, to.fill)) {
    node.setAttr("pageFill", to.fill);
    rect?.fill?.(colorWithOpacity(to.fill, fillOpacity));
  }
  setNodeColorIfDefault(rect, (item) => item?.stroke?.(), (item, color) => item.stroke(color), from.stroke, to.stroke);
  setNodeColorIfDefault(label, (item) => item?.fill?.(), (item, color) => item.fill(color), from.labelColor, to.labelColor);
  setNodeColorIfDefault(
    header,
    (item) => item?.stroke?.(),
    (item, color) => item.stroke(color),
    from.headerLineStroke,
    to.headerLineStroke,
  );
  setNodeColorIfDefault(
    rect,
    (item) => item?.shadowColor?.(),
    (item, color) => item.shadowColor(color),
    from.shadowColor,
    to.shadowColor,
  );
}

function retintSticky(node, from, to) {
  const rect = node.findOne?.(".sticky-bg");
  const text = node.findOne?.(".sticky-text");
  const fillOpacity = Number.isFinite(node.getAttr?.("stickyFillOpacity"))
    ? node.getAttr("stickyFillOpacity")
    : 1;

  if (isDefaultThemeColor(node.getAttr?.("stickyFill") ?? rect?.fill?.(), from.fill, to.fill)) {
    node.setAttr("stickyFill", to.fill);
    rect?.fill?.(colorWithOpacity(to.fill, fillOpacity));
  }
  setNodeColorIfDefault(text, (item) => item?.fill?.(), (item, color) => item.fill(color), from.textColor, to.textColor);
  setNodeColorIfDefault(
    rect,
    (item) => item?.shadowColor?.(),
    (item, color) => item.shadowColor(color),
    from.shadowColor,
    to.shadowColor,
  );
}

function retintButton(node, from, to) {
  const label = node.findOne?.(".button-label");
  const visuals = Array.from(node.find?.(".button-visual") ?? []);
  const fillOpacity = Number.isFinite(node.getAttr?.("buttonFillOpacity"))
    ? node.getAttr("buttonFillOpacity")
    : 1;

  if (isDefaultThemeColor(node.getAttr?.("buttonFill"), from.fill, to.fill)) {
    node.setAttr("buttonFill", to.fill);
    visuals.forEach((visual) => visual.fill?.(colorWithOpacity(to.fill, fillOpacity)));
  }
  if (isDefaultThemeColor(node.getAttr?.("buttonStroke"), from.stroke, to.stroke)) {
    node.setAttr("buttonStroke", to.stroke);
    visuals.forEach((visual) => visual.stroke?.(to.stroke));
  }
  if (isDefaultThemeColor(node.getAttr?.("buttonTextColor") ?? label?.fill?.(), from.textColor, to.textColor)) {
    node.setAttr("buttonTextColor", to.textColor);
    label?.fill?.(to.textColor);
  }
  visuals.forEach((visual) => {
    setNodeColorIfDefault(
      visual,
      (item) => item?.shadowColor?.(),
      (item, color) => item.shadowColor(color),
      from.shadowColor,
      to.shadowColor,
    );
  });
}

function retintSimpleChrome(node, selectors, from, to) {
  selectors.forEach(([selector, method, fromKey, toKey = fromKey]) => {
    const target = node.findOne?.(selector);
    setNodeColorIfDefault(target, (item) => item?.[method]?.(), (item, color) => item[method](color), from[fromKey], to[toKey]);
  });
}

function retintImage(node, from, to) {
  if (node.getAttr?.("imageSrc")) return;
  retintSimpleChrome(node, [
    [".placeholder-rect", "fill", "fill"],
    [".placeholder-rect", "stroke", "stroke"],
    [".placeholder-text", "fill", "textColor"],
  ], from, to);
}

function retintIframe(node, from, to) {
  retintSimpleChrome(node, [
    [".iframe-bg", "fill", "fill"],
    [".iframe-bg", "stroke", "stroke"],
    [".iframe-bg", "shadowColor", "shadowColor"],
    [".iframe-header", "stroke", "headerLineStroke"],
    [".iframe-placeholder", "fill", "placeholderColor"],
  ], from, to);
}

function retintVideo(node, from, to) {
  retintSimpleChrome(node, [
    [".video-bg", "fill", "fill"],
    [".video-bg", "stroke", "stroke"],
    [".video-area", "fill", "bodyFill"],
    [".video-placeholder", "fill", "placeholderColor"],
  ], from, to);
}

function retintJavascriptEditor(node, from, to) {
  retintSimpleChrome(node, [
    [".javascript-editor-bg", "fill", "fill"],
    [".javascript-editor-bg", "stroke", "stroke"],
    [".javascript-editor-bg", "shadowColor", "shadowColor"],
    [".javascript-editor-divider", "stroke", "dividerStroke"],
    [".javascript-editor-title", "fill", "titleColor"],
    [".javascript-editor-static-editor", "fill", "editorFill"],
    [".javascript-editor-static-editor", "stroke", "editorStroke"],
    [".javascript-editor-static-code-cursor", "stroke", "cursorStroke"],
    [".javascript-editor-static-splitter", "fill", "splitterFill"],
    [".javascript-editor-static-output", "fill", "outputFill"],
    [".javascript-editor-static-output", "stroke", "editorStroke"],
    [".javascript-editor-static-tab", "fill", "tabFill"],
    [".javascript-editor-static-output-hint", "fill", "hintColor"],
  ], from, to);
  Array.from(node.find?.(".javascript-editor-static-code-line") ?? []).forEach((line, index) => {
    setNodeColorIfDefault(
      line,
      (item) => item?.stroke?.(),
      (item, color) => item.stroke(color),
      from.codeLineStrokes?.[index],
      to.codeLineStrokes?.[index],
    );
  });
}

function retintConnection(node, from, to) {
  const line = node.findOne?.(".connection-line");
  if (!line) return;
  const current = node.getAttr?.("connectionStroke") ?? line.stroke?.();
  if (!isDefaultThemeColor(current, from.stroke, to.stroke)) return;
  node.setAttr?.("connectionStroke", to.stroke);
  line.stroke?.(to.stroke);
  line.fill?.(to.stroke);
}

function retintRankingBox(app, node, from, to) {
  const data = node.getAttr?.("data") ?? {};
  const themeColor = data.themeColor;
  const titleColor = data.titleColor;
  if (!isDefaultThemeColor(themeColor, from.themeColor, to.themeColor)) return;

  const component = app.components?.get?.("rankingBox");
  component?.setData?.(node, {
    ...data,
    themeColor: to.themeColor,
    titleColor: isDefaultThemeColor(titleColor, from.titleColor, to.titleColor)
      ? to.titleColor
      : titleColor,
  });
}

export function applyCanvasThemeToDefaultNodes(app, themeId) {
  const targetThemeId = CANVAS_THEME_DEFAULTS[themeId] ? themeId : CANVAS_THEME_IDS.default;
  const sourceThemeId = targetThemeId === CANVAS_THEME_IDS.colorful
    ? CANVAS_THEME_IDS.default
    : CANVAS_THEME_IDS.colorful;
  const from = getCanvasTheme(sourceThemeId);
  const to = getCanvasTheme(targetThemeId);

  app.mainLayer?.find?.(".selectable")?.forEach((node) => {
    const type = node.getAttr?.("componentType");
    if (type === "page") retintPage(node, from.page, to.page);
    if (type === "sticky") retintSticky(node, from.sticky, to.sticky);
    if (type === "button") retintButton(node, from.button, to.button);
    if (type === "image") retintImage(node, from.image, to.image);
    if (type === "iframe") retintIframe(node, from.iframe, to.iframe);
    if (type === "video") retintVideo(node, from.video, to.video);
    if (type === "javascriptEditor") retintJavascriptEditor(node, from.javascriptEditor, to.javascriptEditor);
    if (type === "rankingBox") retintRankingBox(app, node, from.rankingBox, to.rankingBox);
    if (type === "connection") retintConnection(node, from.connection, to.connection);
  });

  app.mainLayer?.batchDraw?.();
}
