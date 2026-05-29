function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function rectsIntersect(a, b) {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function intersectRects(a, b) {
  if (!rectsIntersect(a, b)) return null;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function getRectFromPoints(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function clampRectToBounds(rect, width, height) {
  const x1 = clamp(rect.x, 0, width);
  const y1 = clamp(rect.y, 0, height);
  const x2 = clamp(rect.x + rect.width, 0, width);
  const y2 = clamp(rect.y + rect.height, 0, height);
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function formatCssNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function getDisjointCoverRects(width, height, rects = []) {
  const sourceRects = rects
    .map((rect) => clampRectToBounds(rect, width, height))
    .filter((rect) => rect.width >= 1 && rect.height >= 1);

  if (!sourceRects.length) return [];

  const xs = [...new Set(
    sourceRects.flatMap((rect) => [
      formatCssNumber(rect.x),
      formatCssNumber(rect.x + rect.width),
    ]),
  )].sort((a, b) => a - b);

  const ys = [...new Set(
    sourceRects.flatMap((rect) => [
      formatCssNumber(rect.y),
      formatCssNumber(rect.y + rect.height),
    ]),
  )].sort((a, b) => a - b);

  const disjointRects = [];
  for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
    const y1 = ys[yIndex];
    const y2 = ys[yIndex + 1];
    if (y2 - y1 < 1) continue;

    let currentRowRect = null;
    for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
      const x1 = xs[xIndex];
      const x2 = xs[xIndex + 1];
      if (x2 - x1 < 1) continue;

      const center = {
        x: x1 + (x2 - x1) / 2,
        y: y1 + (y2 - y1) / 2,
      };
      const isCovered = sourceRects.some((rect) => (
        center.x >= rect.x &&
        center.x <= rect.x + rect.width &&
        center.y >= rect.y &&
        center.y <= rect.y + rect.height
      ));

      if (!isCovered) {
        if (currentRowRect) {
          disjointRects.push(currentRowRect);
          currentRowRect = null;
        }
        continue;
      }

      if (currentRowRect && Math.abs(currentRowRect.x + currentRowRect.width - x1) < 0.01) {
        currentRowRect.width = x2 - currentRowRect.x;
      } else {
        if (currentRowRect) {
          disjointRects.push(currentRowRect);
        }
        currentRowRect = {
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
        };
      }
    }

    if (currentRowRect) {
      disjointRects.push(currentRowRect);
    }
  }

  return disjointRects;
}

function buildOverlayClipPath(width, height, occlusionRects) {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const pathParts = [
    `M 0 0 H ${formatCssNumber(safeWidth)} V ${formatCssNumber(safeHeight)} H 0 Z`,
  ];

  occlusionRects.forEach((rect) => {
    const x1 = formatCssNumber(rect.x);
    const y1 = formatCssNumber(rect.y);
    const x2 = formatCssNumber(rect.x + rect.width);
    const y2 = formatCssNumber(rect.y + rect.height);
    pathParts.push(`M ${x1} ${y1} V ${y2} H ${x2} V ${y1} H ${x1} Z`);
  });

  return `path("${pathParts.join(" ")}")`;
}

function buildOverlayMask(width, height, occlusionRects) {
  const safeWidth = Math.max(1, formatCssNumber(width));
  const safeHeight = Math.max(1, formatCssNumber(height));
  const holes = occlusionRects.map((rect) => (
    `<rect x="${formatCssNumber(rect.x)}" y="${formatCssNumber(rect.y)}" width="${formatCssNumber(rect.width)}" height="${formatCssNumber(rect.height)}" fill="black"/>`
  )).join("");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">`,
    `<rect width="${safeWidth}" height="${safeHeight}" fill="white"/>`,
    holes,
    "</svg>",
  ].join("");

  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

function isAncestorNode(ancestor, node) {
  if (!ancestor || !node || ancestor === node) return false;
  let parent = node.getParent?.() ?? null;
  while (parent) {
    if (parent === ancestor) return true;
    parent = parent.getParent?.() ?? null;
  }
  return false;
}

function resolveStackIndex(app, node) {
  if (!node) return -1;
  const appStackIndex = app?.getSelectableStackIndex?.(node);
  if (Number.isFinite(appStackIndex)) return appStackIndex;
  const absoluteIndex = node.getAbsoluteZIndex?.();
  return Number.isFinite(absoluteIndex) ? absoluteIndex : -1;
}

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function transformLocalRectToStageRect(node, stage, rect) {
  const transform = node?.getAbsoluteTransform?.(stage);
  if (!transform?.point || !rect) return null;

  return getRectFromPoints([
    transform.point({ x: rect.x, y: rect.y }),
    transform.point({ x: rect.x + rect.width, y: rect.y }),
    transform.point({ x: rect.x + rect.width, y: rect.y + rect.height }),
    transform.point({ x: rect.x, y: rect.y + rect.height }),
  ]);
}

function clampShapeBandHeight(height) {
  return Math.max(1, Math.min(8, height / 10 || 1));
}

function getStrokeHalf(strokeWidth) {
  return Math.max(0, strokeWidth / 2);
}

function getRectShapeLocalRects(width, height, strokeWidth, hasFill) {
  const strokeHalf = getStrokeHalf(strokeWidth);
  if (hasFill) {
    return [{
      x: -strokeHalf,
      y: -strokeHalf,
      width: width + strokeWidth,
      height: height + strokeWidth,
    }];
  }

  const border = Math.max(0, Math.min(strokeWidth, width + strokeWidth, height + strokeWidth));
  if (border < 1) return [];
  if (strokeWidth >= Math.min(width, height)) {
    return [{
      x: -strokeHalf,
      y: -strokeHalf,
      width: width + strokeWidth,
      height: height + strokeWidth,
    }];
  }

  return [
    {
      x: -strokeHalf,
      y: -strokeHalf,
      width: width + strokeWidth,
      height: border,
    },
    {
      x: -strokeHalf,
      y: height - strokeHalf,
      width: width + strokeWidth,
      height: border,
    },
    {
      x: -strokeHalf,
      y: strokeHalf,
      width: border,
      height: Math.max(0, height - strokeWidth),
    },
    {
      x: width - strokeHalf,
      y: strokeHalf,
      width: border,
      height: Math.max(0, height - strokeWidth),
    },
  ].filter((rect) => rect.width >= 1 && rect.height >= 1);
}

function getExpandedExtents(getExtents, y, width, height, expansion) {
  const expandedWidth = Math.max(0, width + expansion * 2);
  const expandedHeight = Math.max(0, height + expansion * 2);
  if (expandedWidth < 1 || expandedHeight < 1) return null;

  const outer = getExtents(y + expansion, expandedWidth, expandedHeight);
  if (!outer) return null;
  return {
    start: outer.start - expansion,
    end: outer.end - expansion,
  };
}

function buildSliceRects(width, height, strokeWidth, hasFill, getOuterExtents, getInnerExtents) {
  const strokeHalf = getStrokeHalf(strokeWidth);
  const minY = hasFill || strokeWidth > 0 ? -strokeHalf : 0;
  const maxY = hasFill || strokeWidth > 0 ? height + strokeHalf : height;
  const bandHeight = clampShapeBandHeight(height + strokeWidth);
  const rects = [];

  for (let y = minY; y < maxY; y += bandHeight) {
    const nextY = Math.min(maxY, y + bandHeight);
    const centerY = y + (nextY - y) / 2;
    const outer = getOuterExtents(centerY, width, height);
    if (!outer || outer.end - outer.start < 1) continue;

    if (hasFill) {
      rects.push({
        x: outer.start,
        y,
        width: outer.end - outer.start,
        height: nextY - y,
      });
      continue;
    }

    const inner = getInnerExtents?.(centerY, width, height, strokeWidth) ?? null;
    if (!inner || inner.end - inner.start < 1) {
      rects.push({
        x: outer.start,
        y,
        width: outer.end - outer.start,
        height: nextY - y,
      });
      continue;
    }

    const leftWidth = Math.max(0, inner.start - outer.start);
    const rightWidth = Math.max(0, outer.end - inner.end);
    if (leftWidth >= 1) {
      rects.push({
        x: outer.start,
        y,
        width: leftWidth,
        height: nextY - y,
      });
    }
    if (rightWidth >= 1) {
      rects.push({
        x: inner.end,
        y,
        width: rightWidth,
        height: nextY - y,
      });
    }
  }

  return rects;
}

function getOvalExtents(y, width, height) {
  const radiusY = height / 2;
  const radiusX = width / 2;
  if (radiusX < 0.5 || radiusY < 0.5) return null;

  const offsetY = Math.abs(y - radiusY);
  if (offsetY > radiusY) return null;
  const ratio = Math.sqrt(Math.max(0, 1 - (offsetY * offsetY) / (radiusY * radiusY)));
  const halfWidth = radiusX * ratio;
  return {
    start: radiusX - halfWidth,
    end: radiusX + halfWidth,
  };
}

function getDiamondExtents(y, width, height) {
  if (width < 1 || height < 1) return null;
  const centerY = height / 2;
  const progress = centerY <= 0
    ? 0
    : y <= centerY
      ? y / centerY
      : (height - y) / centerY;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const halfWidth = (width / 2) * clampedProgress;
  return {
    start: width / 2 - halfWidth,
    end: width / 2 + halfWidth,
  };
}

function getTriangleExtents(y, width, height) {
  if (width < 1 || height < 1) return null;
  const progress = Math.max(0, Math.min(1, y / Math.max(height, 1)));
  const halfWidth = (width / 2) * progress;
  return {
    start: width / 2 - halfWidth,
    end: width / 2 + halfWidth,
  };
}

function getInsetExtents(getExtents, y, width, height, inset) {
  const innerWidth = Math.max(0, width - inset * 2);
  const innerHeight = Math.max(0, height - inset * 2);
  if (innerWidth < 1 || innerHeight < 1) return null;

  const inner = getExtents(y - inset, innerWidth, innerHeight);
  if (!inner) return null;
  return {
    start: inner.start + inset,
    end: inner.end + inset,
  };
}

function getShapeLocalOcclusionRects(node) {
  if (node?.getAttr?.("componentType") !== "shape") return null;

  const width = toFiniteNumber(node.width?.(), 0);
  const height = toFiniteNumber(node.height?.(), 0);
  const strokeWidth = Math.max(0, toFiniteNumber(node.getAttr?.("shapeStrokeWidth"), 0));
  const fillOpacity = Math.max(0, Math.min(1, toFiniteNumber(node.getAttr?.("shapeFillOpacity"), 0)));
  const shapeType = String(node.getAttr?.("shapeType") ?? "rectangle");
  const hasFill = fillOpacity > 0.001;

  if (width < 1 || height < 1) return [];
  if (!hasFill && strokeWidth < 1) return [];

  if (shapeType === "rectangle") {
    return getRectShapeLocalRects(width, height, strokeWidth, hasFill);
  }

  if (shapeType === "oval") {
    return buildSliceRects(
      width,
      height,
      strokeWidth,
      hasFill,
      (yValue, currentWidth, currentHeight) => (
        getExpandedExtents(getOvalExtents, yValue, currentWidth, currentHeight, getStrokeHalf(strokeWidth))
      ),
      (yValue, currentWidth, currentHeight) => (
        getInsetExtents(getOvalExtents, yValue, currentWidth, currentHeight, getStrokeHalf(strokeWidth))
      ),
    );
  }

  if (shapeType === "rhombus") {
    return buildSliceRects(
      width,
      height,
      strokeWidth,
      hasFill,
      (yValue, currentWidth, currentHeight) => (
        getExpandedExtents(
          getDiamondExtents,
          yValue,
          currentWidth,
          currentHeight,
          getStrokeHalf(strokeWidth),
        )
      ),
      (yValue, currentWidth, currentHeight) => (
        getInsetExtents(
          getDiamondExtents,
          yValue,
          currentWidth,
          currentHeight,
          getStrokeHalf(strokeWidth),
        )
      ),
    );
  }

  if (shapeType === "triangle") {
    return buildSliceRects(
      width,
      height,
      strokeWidth,
      hasFill,
      (yValue, currentWidth, currentHeight) => (
        getExpandedExtents(
          getTriangleExtents,
          yValue,
          currentWidth,
          currentHeight,
          getStrokeHalf(strokeWidth),
        )
      ),
      (yValue, currentWidth, currentHeight) => (
        getInsetExtents(
          getTriangleExtents,
          yValue,
          currentWidth,
          currentHeight,
          getStrokeHalf(strokeWidth),
        )
      ),
    );
  }

  return null;
}

function getCandidateStageRects(candidate, stage) {
  const shapeRects = getShapeLocalOcclusionRects(candidate);
  if (shapeRects) {
    const stageRects = shapeRects
      .map((rect) => transformLocalRectToStageRect(candidate, stage, rect))
      .filter((rect) => rect && rect.width >= 1 && rect.height >= 1);
    const textNode = candidate.findOne?.(".shape-text") ?? null;
    const shapeText = String(textNode?.text?.() ?? "").trim();
    const textRect = shapeText
      ? textNode?.getClientRect?.({
          relativeTo: stage,
          skipShadow: true,
        })
      : null;
    if (textRect?.width >= 1 && textRect?.height >= 1) {
      stageRects.push(textRect);
    }
    return stageRects;
  }

  const candidateBox = candidate.getClientRect({
    relativeTo: stage,
    skipShadow: true,
  });
  return candidateBox ? [candidateBox] : [];
}

export function getOverlayOcclusionRects(app, node, width, height) {
  const stage = node?.getStage?.() ?? null;
  const layer = app?.mainLayer ?? node?.getLayer?.() ?? null;
  if (!stage || !layer) return [];

  const ownBox = node.getClientRect({
    relativeTo: stage,
    skipShadow: true,
  });
  const ownStackIndex = resolveStackIndex(app, node);
  const candidates = layer.find?.(".selectable") ?? [];
  const localTransform = node.getAbsoluteTransform(stage).copy().invert();

  return candidates.flatMap((candidate) => {
    if (!candidate || candidate === node) return [];
    if (!candidate.getStage?.()) return [];
    if (candidate.isVisible?.() === false) return [];
    if ((candidate.opacity?.() ?? 1) <= 0) return [];
    if (candidate.getAttr?.("componentType") === "connection") return [];
    if (isAncestorNode(candidate, node) || isAncestorNode(node, candidate)) return [];
    if (resolveStackIndex(app, candidate) <= ownStackIndex) return [];

    return getCandidateStageRects(candidate, stage).flatMap((candidateRect) => {
      const intersection = intersectRects(ownBox, candidateRect);
      if (!intersection) return [];

      const localRect = getRectFromPoints([
        localTransform.point({ x: intersection.x, y: intersection.y }),
        localTransform.point({ x: intersection.x + intersection.width, y: intersection.y }),
        localTransform.point({
          x: intersection.x + intersection.width,
          y: intersection.y + intersection.height,
        }),
        localTransform.point({ x: intersection.x, y: intersection.y + intersection.height }),
      ]);
      const clippedRect = clampRectToBounds(localRect, width, height);
      if (clippedRect.width < 1 || clippedRect.height < 1) return [];
      return [clippedRect];
    });
  });
}

export function applyOverlayOcclusionStyles(overlay, width, height, occlusionRects = []) {
  const disjointOcclusionRects = getDisjointCoverRects(width, height, occlusionRects);
  if (!disjointOcclusionRects.length) {
    overlay.style.clipPath = "";
    overlay.style.maskImage = "";
    overlay.style.webkitMaskImage = "";
    overlay.style.maskSize = "";
    overlay.style.webkitMaskSize = "";
    overlay.style.maskRepeat = "";
    overlay.style.webkitMaskRepeat = "";
    return;
  }

  const clipPath = buildOverlayClipPath(width, height, disjointOcclusionRects);
  const maskImage = buildOverlayMask(width, height, disjointOcclusionRects);
  overlay.style.clipPath = clipPath;
  overlay.style.maskImage = maskImage;
  overlay.style.webkitMaskImage = maskImage;
  overlay.style.maskSize = "100% 100%";
  overlay.style.webkitMaskSize = "100% 100%";
  overlay.style.maskRepeat = "no-repeat";
  overlay.style.webkitMaskRepeat = "no-repeat";
}
