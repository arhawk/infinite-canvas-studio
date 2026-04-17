const DEFAULT_ANNOTATION_COLOR = "#2563eb";
const HIGHLIGHT_OPACITY = 0.7;
const MIN_HIGHLIGHT_HEIGHT = 10;
const HIGHLIGHT_STROKE = "#2563eb";

let textAnnotationCount = 0;

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeAnnotationId(id) {
  return typeof id === "string" && id ? id : null;
}

function normalizeAnnotationColor(color) {
  return typeof color === "string" && color ? color : DEFAULT_ANNOTATION_COLOR;
}

function normalizeAnnotationRange(start, end) {
  const startIndex = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
  const endIndex = Number.isFinite(end) ? Math.max(0, Math.floor(end)) : startIndex;

  if (endIndex >= startIndex) {
    return {
      start: startIndex,
      end: endIndex,
    };
  }

  return {
    start: endIndex,
    end: startIndex,
  };
}

function nextTextAnnotationId() {
  textAnnotationCount += 1;
  return `text-annotation-${textAnnotationCount}`;
}

function measureSubstringWidth(textNode, text) {
  if (!text) return 0;
  return textNode.measureSize?.(text)?.width ?? 0;
}

function getTextLineTranslateX(textNode, lineWidth, lastInParagraph) {
  const align = textNode.align?.() ?? "left";
  const totalWidth = textNode.width?.() ?? 0;
  const padding = textNode.padding?.() ?? 0;

  if (align === "right") {
    return totalWidth - lineWidth - padding * 2;
  }

  if (align === "center") {
    return (totalWidth - lineWidth - padding * 2) / 2;
  }

  if (align === "justify" && !lastInParagraph) {
    return 0;
  }

  return 0;
}

function getTextAlignY(textNode, textArrLength, lineHeightPx) {
  const verticalAlign = textNode.verticalAlign?.() ?? "top";
  const padding = textNode.padding?.() ?? 0;
  const totalHeight = textNode.height?.() ?? 0;

  if (verticalAlign === "middle") {
    return (totalHeight - textArrLength * lineHeightPx - padding * 2) / 2;
  }

  if (verticalAlign === "bottom") {
    return totalHeight - textArrLength * lineHeightPx - padding * 2;
  }

  return 0;
}

function groupTextLinesByParagraph(textArr) {
  const paragraphs = [];
  let current = [];

  for (const line of textArr) {
    current.push(line);
    if (line?.lastInParagraph) {
      paragraphs.push(current);
      current = [];
    }
  }

  if (current.length) {
    paragraphs.push(current);
  }

  return paragraphs;
}

export function getTextAnnotationColor() {
  return DEFAULT_ANNOTATION_COLOR;
}

export function getTextHighlightOpacity() {
  return HIGHLIGHT_OPACITY;
}

export function getTextHighlightStroke() {
  return HIGHLIGHT_STROKE;
}

export function createTextAnnotation({
  id = nextTextAnnotationId(),
  target = "text",
  start = 0,
  end = 0,
  color = DEFAULT_ANNOTATION_COLOR,
} = {}) {
  const range = normalizeAnnotationRange(start, end);

  return {
    id,
    target,
    start: range.start,
    end: range.end,
    color: normalizeAnnotationColor(color),
  };
}

export function normalizeTextAnnotations(value) {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((annotation) => {
      if (!annotation || typeof annotation !== "object") return null;

      const id = normalizeAnnotationId(annotation.id) ?? nextTextAnnotationId();
      const target = typeof annotation.target === "string" && annotation.target
        ? annotation.target
        : "text";
      const range = normalizeAnnotationRange(annotation.start, annotation.end);

      if (range.end <= range.start) {
        return null;
      }

      return {
        id,
        target,
        start: range.start,
        end: range.end,
        color: normalizeAnnotationColor(annotation.color),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.target !== b.target) {
        return a.target.localeCompare(b.target);
      }
      if (a.color !== b.color) {
        return a.color.localeCompare(b.color);
      }
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return a.end - b.end;
    });

  const merged = [];
  for (const annotation of normalized) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.target === annotation.target &&
      previous.color === annotation.color &&
      annotation.start <= previous.end
    ) {
      previous.end = Math.max(previous.end, annotation.end);
      continue;
    }

    merged.push({ ...annotation });
  }

  return merged;
}

export function getNodeTextAnnotations(node) {
  return normalizeTextAnnotations(node?.getAttr?.("textAnnotations"));
}

export function setNodeTextAnnotations(node, annotations) {
  if (!node?.setAttr) return;
  node.setAttr("textAnnotations", normalizeTextAnnotations(annotations));
}

export function serializeNodeTextAnnotations(node) {
  return clonePlainData(getNodeTextAnnotations(node));
}

export function getAnnotatableTextTargets(node) {
  const componentType = node?.getAttr?.("componentType");

  if (componentType === "text" && node?.getClassName?.() === "Text") {
    return [{ targetKey: "text", textNode: node }];
  }

  if (componentType === "sticky") {
    const textNode = node.findOne?.(".sticky-text") ?? null;
    if (textNode?.getClassName?.() === "Text") {
      return [{ targetKey: "sticky-text", textNode }];
    }
  }

  return [];
}

export function resolveAnnotatableTextTarget(target) {
  if (target?.getClassName?.() !== "Text") return null;

  const ownerNode = target.hasName?.("selectable")
    ? target
    : target.findAncestor?.(".selectable", true);

  if (!ownerNode) return null;

  const targetMatch = getAnnotatableTextTargets(ownerNode).find(
    (entry) => entry.textNode === target,
  );

  if (!targetMatch) return null;

  return {
    ownerNode,
    targetKey: targetMatch.targetKey,
    textNode: targetMatch.textNode,
  };
}

export function buildAnnotatableTextLayout(textNode) {
  const text = textNode?.text?.() ?? "";
  const textArr = Array.isArray(textNode?.textArr) ? textNode.textArr : [];
  const fontSize = Number(textNode?.fontSize?.() ?? 0);
  const lineHeightPx = Number(textNode?.lineHeight?.() ?? 1) * fontSize;
  const padding = Number(textNode?.padding?.() ?? 0);
  const alignY = getTextAlignY(textNode, textArr.length, lineHeightPx);
  const paragraphs = text.split("\n");
  const paragraphLines = groupTextLinesByParagraph(textArr);
  const lines = [];

  let globalOffset = 0;
  let visualLineIndex = 0;

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const paragraphText = paragraphs[paragraphIndex] ?? "";
    const renderedLines = paragraphLines[paragraphIndex] ?? [];
    let paragraphCursor = 0;

    for (const line of renderedLines) {
      const renderedText = String(line?.text ?? "");
      let lineStart = paragraphText.indexOf(renderedText, paragraphCursor);
      if (lineStart < 0) {
        lineStart = paragraphCursor;
      }
      const lineEnd = lineStart + renderedText.length;
      const x = padding + getTextLineTranslateX(
        textNode,
        Number(line?.width ?? measureSubstringWidth(textNode, renderedText)),
        line?.lastInParagraph === true,
      );
      const y = padding + alignY + visualLineIndex * lineHeightPx;

      lines.push({
        text: renderedText,
        width: Number(line?.width ?? measureSubstringWidth(textNode, renderedText)),
        rawStart: globalOffset + lineStart,
        rawEnd: globalOffset + lineEnd,
        x,
        y,
        lineHeight: lineHeightPx,
        lastInParagraph: line?.lastInParagraph === true,
      });

      paragraphCursor = lineEnd;
      visualLineIndex += 1;
    }

    globalOffset += paragraphText.length;
    if (paragraphIndex < paragraphs.length - 1) {
      globalOffset += 1;
    }
  }

  return {
    text,
    fontSize,
    lineHeight: lineHeightPx,
    padding,
    alignY,
    lines,
  };
}

export function getTextIndexAtLocalPoint(textNode, localPoint) {
  const layout = buildAnnotatableTextLayout(textNode);
  const { lines, text } = layout;

  if (!lines.length) return 0;

  const lineHeight = layout.lineHeight || Math.max(layout.fontSize, 1);
  const rawLineIndex = Math.floor((localPoint.y - layout.padding - layout.alignY) / lineHeight);
  const lineIndex = Math.max(0, Math.min(lines.length - 1, rawLineIndex));
  const line = lines[lineIndex];
  const relativeX = localPoint.x - line.x;

  if (relativeX <= 0) {
    return line.rawStart;
  }

  if (relativeX >= line.width) {
    return line.rawEnd;
  }

  let currentX = 0;
  for (let index = 0; index < line.text.length; index += 1) {
    const char = line.text[index];
    const charWidth = measureSubstringWidth(textNode, char);
    const boundary = currentX + charWidth / 2;

    if (relativeX <= boundary) {
      return line.rawStart + index;
    }

    currentX += charWidth;
  }

  return line.rawEnd;
}

export function getHighlightRectsForRange(textNode, start, end) {
  const layout = buildAnnotatableTextLayout(textNode);
  const textLength = layout.text.length;
  const range = normalizeAnnotationRange(
    Math.max(0, Math.min(start, textLength)),
    Math.max(0, Math.min(end, textLength)),
  );

  if (range.end <= range.start) {
    return [];
  }

  const highlightHeight = Math.max(MIN_HIGHLIGHT_HEIGHT, layout.fontSize * 0.82);

  return layout.lines.flatMap((line) => {
    const overlapStart = Math.max(range.start, line.rawStart);
    const overlapEnd = Math.min(range.end, line.rawEnd);

    if (overlapEnd <= overlapStart) {
      return [];
    }

    const startOffset = overlapStart - line.rawStart;
    const endOffset = overlapEnd - line.rawStart;
    const beforeText = line.text.slice(0, startOffset);
    const selectedText = line.text.slice(startOffset, endOffset);
    const x = line.x + measureSubstringWidth(textNode, beforeText);
    const width = Math.max(2, measureSubstringWidth(textNode, selectedText));
    const y = line.y + Math.max(0, (line.lineHeight - highlightHeight) / 2);

    return [{
      x,
      y,
      width,
      height: highlightHeight,
    }];
  });
}

export function getTextAnnotationSummary(node) {
  return getNodeTextAnnotations(node).map((annotation) => ({
    ...annotation,
  }));
}
