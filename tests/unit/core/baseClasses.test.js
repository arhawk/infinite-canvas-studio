import { describe, expect, it } from "vitest";
import { BaseComponent, NumberEditorField } from "../../../src/core/baseClasses.js";

class FakeNode {
  constructor({ name = "", draggable = true } = {}) {
    this.attrs = { name };
    this.draggableState = draggable;
  }

  name() {
    return this.attrs.name;
  }

  draggable() {
    return this.draggableState;
  }

  setAttrs(nextAttrs) {
    this.attrs = {
      ...this.attrs,
      ...nextAttrs,
    };
  }

  getAttr(key) {
    return this.attrs[key];
  }
}

class ExampleComponent extends BaseComponent {
  static type = "example";

  async createNode() {
    return new FakeNode({ name: "custom-node", draggable: true });
  }
}

describe("base classes", () => {
  it("assigns component metadata when creating nodes", async () => {
    const component = new ExampleComponent({});

    const node = await component.create({});

    expect(node.getAttr("componentType")).toBe("example");
    expect(node.getAttr("baseDraggable")).toBe(true);
    expect(node.name()).toContain("selectable");
    expect(node.id).toBeUndefined();
    expect(node.getAttr("id")).toMatch(/^example-\d+$/);
  });

  it("normalizes number fields using min and max constraints", () => {
    const field = new NumberEditorField({
      id: "fontSize",
      label: "Font Size",
      input: { min: 12, max: 24 },
      getValue: () => 16,
    });

    expect(field.normalize("4")).toBe(12);
    expect(field.normalize("18")).toBe(18);
    expect(field.normalize("40")).toBe(24);
    expect(field.normalize("oops", {})).toBe(16);
  });
});
