export class ToolRegistry {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.tools = new Map();
    this.activeId = null;
  }

  register(tool) {
    this.tools.set(tool.id, tool);
  }

  unregister(id) {
    if (this.activeId === id) {
      this.setActive(null);
    }
    this.tools.delete(id);
  }

  setActive(id) {
    if (id && !this.tools.has(id)) {
      console.warn(`Tool not found: ${id}`);
      return;
    }
    if (this.activeId === id) return;

    const previous = this.getActiveTool();
    previous?.deactivate();
    this.activeId = id;
    this.getActiveTool()?.activate();
    this.eventBus.emit("tool:change", { toolId: id });
  }

  getActive() {
    return this.activeId;
  }

  getActiveTool() {
    return this.activeId ? this.tools.get(this.activeId) ?? null : null;
  }

  has(id) {
    return this.tools.has(id);
  }

  list() {
    return [...this.tools.values()].map((tool) => ({
      id: tool.id,
      label: tool.label,
    }));
  }
}
