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

    const candidateBox = candidate.getClientRect({
      relativeTo: stage,
      skipShadow: true,
    });
    const intersection = intersectRects(ownBox, candidateBox);
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
