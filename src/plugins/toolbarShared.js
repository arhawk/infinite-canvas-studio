export function resolveSelectable(target) {
  if (!target) return null;
  if (target.hasName?.("selectable")) return target;
  return target.findAncestor?.(".selectable", true) ?? null;
}

export function resolveSelectableFromStageEvent(app, event) {
  const direct = resolveSelectable(event?.target);
  if (direct?.listening?.() !== false) return direct;

  const stage = app?.stage;
  if (!stage || typeof stage.getIntersection !== "function") return direct;
  if (event?.evt && typeof stage.setPointersPositions === "function") {
    stage.setPointersPositions(event.evt);
  }

  const pointer = stage.getPointerPosition?.() ?? null;
  const intersection = pointer ? stage.getIntersection(pointer) : null;
  const selectable = resolveSelectable(intersection);
  return selectable?.listening?.() !== false ? selectable : direct;
}

export function getClientPoint(app, event) {
  const nativeEvent = event?.evt ?? event;
  const clientX = nativeEvent?.clientX;
  const clientY = nativeEvent?.clientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return { x: clientX, y: clientY };
  }

  const pointer = app?.stage?.getPointerPosition?.() ?? null;
  const rect = app?.stage?.container?.()?.getBoundingClientRect?.() ?? null;
  if (pointer && rect) {
    return { x: rect.left + pointer.x, y: rect.top + pointer.y };
  }

  return null;
}

export function clampToViewport(value, size, margin = 8) {
  return Math.max(margin, Math.min(value, window.innerWidth - size - margin));
}

export function isArrangeEditMode(app) {
  return app?.getMode?.() === "edit" && app?.getEditorTool?.() === "arrange";
}

export function getPluginById(app, pluginId) {
  return app?.getPlugin?.(pluginId)
    ?? app?.plugins?.find?.((plugin) => plugin.id === pluginId)
    ?? null;
}

export function syncLayerActions(panel, actions, selectionPlugin, node, componentType) {
  const canTargetNode = Boolean(
    selectionPlugin
      && node?.getStage?.()
      && node.getAttr?.("componentType") === componentType,
  );

  for (const action of actions) {
    panel?.setButtonState?.(`layer:${action.id}`, {
      disabled: !canTargetNode || !selectionPlugin[action.canRun]?.(node),
      title: action.label,
      label: action.label,
    });
  }
}

export function runLayerAction(panel, actions, selectionPlugin, node, componentType, actionId) {
  const action = actions.find((entry) => entry.id === actionId);
  if (!action || !selectionPlugin || node?.getAttr?.("componentType") !== componentType) {
    return false;
  }

  selectionPlugin[action.run]?.(node);
  panel?.queuePosition?.();
  return true;
}
