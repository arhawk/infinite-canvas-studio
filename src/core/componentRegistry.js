function resolveSelectable(node) {
  if (!node) return null;
  if (node.hasName?.("selectable")) return node;
  return node.findAncestor?.(".selectable", true) ?? null;
}

export class ComponentRegistry {
  constructor() {
    this.components = new Map();
  }

  register(component) {
    this.components.set(component.type, component);
  }

  unregister(type) {
    this.components.delete(type);
  }

  get(type) {
    return this.components.get(type) ?? null;
  }

  getByNode(node) {
    const selectable = resolveSelectable(node);
    if (!selectable) return null;
    return this.get(selectable.getAttr("componentType"));
  }

  async create(type, payload) {
    const component = this.get(type);
    if (!component) {
      console.warn(`Component type not found: ${type}`);
      return null;
    }
    return component.create(payload);
  }

  list() {
    return [...this.components.values()];
  }

  paletteItems() {
    return this.list().filter((component) => component.palette).map((component) => ({
      type: component.type,
      label: component.label,
      description: component.description,
    }));
  }
}
