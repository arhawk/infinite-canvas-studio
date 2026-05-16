export function getViewportCenter(app) {
  const viewport = app.stageApi.getViewportBounds();
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };
}

export async function getCenteredComponentPlacementPoint(app, type, center = getViewportCenter(app)) {
  const component = app.components.get(type);
  if (!component?.createNode) {
    return center;
  }

  const probeNode = await component.createNode({ x: 0, y: 0 });
  try {
    if (!probeNode?.getClientRect) {
      return center;
    }

    const box = probeNode.getClientRect({ skipTransform: true });
    return {
      x: center.x - (box.x + box.width / 2),
      y: center.y - (box.y + box.height / 2),
    };
  } finally {
    probeNode?.destroy?.();
  }
}
