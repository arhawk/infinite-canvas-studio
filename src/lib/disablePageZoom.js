const ZOOM_KEYS = new Set(["+", "=", "-", "_", "0"]);

export function disablePageZoom(targetWindow = window) {
  const preventZoomWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
  };

  const preventZoomKeys = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (!ZOOM_KEYS.has(event.key)) return;
    event.preventDefault();
  };

  const preventGesture = (event) => {
    event.preventDefault();
  };

  targetWindow.addEventListener("wheel", preventZoomWheel, {
    capture: true,
    passive: false,
  });
  targetWindow.addEventListener("keydown", preventZoomKeys, true);
  targetWindow.addEventListener("gesturestart", preventGesture, { passive: false });
  targetWindow.addEventListener("gesturechange", preventGesture, { passive: false });
  targetWindow.addEventListener("gestureend", preventGesture, { passive: false });

  return () => {
    targetWindow.removeEventListener("wheel", preventZoomWheel, { capture: true });
    targetWindow.removeEventListener("keydown", preventZoomKeys, true);
    targetWindow.removeEventListener("gesturestart", preventGesture);
    targetWindow.removeEventListener("gesturechange", preventGesture);
    targetWindow.removeEventListener("gestureend", preventGesture);
  };
}
