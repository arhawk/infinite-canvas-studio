const DRAG_THRESHOLD = 4;

export function createOverlayNodeDragBridge({
  app,
  node,
  handle,
  canStartDrag = () => true,
  isInteractiveTarget = () => false,
  onPointerDown = null,
  dragCursor = "grabbing",
} = {}) {
  if (!app || !node || !handle) {
    return () => {};
  }

  const stage = node.getStage?.() ?? null;
  if (!stage) {
    return () => {};
  }

  let pendingDrag = null;
  let dragging = false;

  const clearDocumentState = () => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  const clearPendingDrag = () => {
    pendingDrag = null;
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0) return;
    if (!canStartDrag(event)) return;
    if (isInteractiveTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    stage.setPointersPositions?.(event);
    onPointerDown?.(event);
    pendingDrag = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    document.body.style.userSelect = "none";
  };

  const handleMouseMove = (event) => {
    if (!pendingDrag || dragging) return;
    if (!canStartDrag(event)) {
      finishPointerInteraction();
      return;
    }

    const distance = Math.hypot(
      event.clientX - pendingDrag.clientX,
      event.clientY - pendingDrag.clientY,
    );
    if (distance < DRAG_THRESHOLD) return;

    stage.setPointersPositions?.(event);
    dragging = true;
    clearPendingDrag();
    document.body.style.cursor = dragCursor;
    node.startDrag?.();
  };

  const finishPointerInteraction = () => {
    clearPendingDrag();
    dragging = false;
    clearDocumentState();
  };

  handle.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", finishPointerInteraction);
  node.on("dragend.overlayDragBridge", finishPointerInteraction);

  return () => {
    handle.removeEventListener("mousedown", handleMouseDown);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", finishPointerInteraction);
    node.off("dragend.overlayDragBridge", finishPointerInteraction);
    finishPointerInteraction();
  };
}
