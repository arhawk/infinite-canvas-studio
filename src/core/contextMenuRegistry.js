export class ContextMenuRegistry {
  constructor(app) {
    this.app = app;
    this.items = new Map();
    this.featureCleanups = new Map();
  }

  register(item) {
    const feature = item.createModeFeature?.();
    if (feature) {
      this.featureCleanups.set(item.id, this.app.modeManager.register(feature));
    }
    this.items.set(item.id, item);
  }

  unregister(id) {
    this.featureCleanups.get(id)?.();
    this.featureCleanups.delete(id);
    this.items.delete(id);
  }

  getItems(target) {
    return [...this.items.values()].filter((item) => (
      item.isVisible() && item.condition(target)
    ));
  }

  list() {
    return [...this.items.values()];
  }
}
