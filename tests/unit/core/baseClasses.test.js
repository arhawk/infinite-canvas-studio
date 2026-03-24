import { describe, expect, it } from "vitest";
import { BaseComponent, NumberEditorField } from "../../../src/core/baseClasses.js";

class FakeNode {
  constructor({ name = "", draggable = true, x = 0, y = 0, label = "" } = {}) {
    this.attrs = {
      name,
      label,
      x,
      y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      opacity: 1,
    };
    this.draggableState = draggable;
  }

  name() {
    return this.attrs.name;
  }

  hasName(name) {
    return this.attrs.name.split(" ").includes(name);
  }

  id() {
    return this.attrs.id;
  }

  draggable() {
    return this.draggableState;
  }

  x() {
    return this.attrs.x;
  }

  y() {
    return this.attrs.y;
  }

  position(nextPosition) {
    if (!nextPosition) {
      return { x: this.attrs.x, y: this.attrs.y };
    }

    this.attrs.x = nextPosition.x;
    this.attrs.y = nextPosition.y;
  }

  rotation(value) {
    if (value == null) return this.attrs.rotation;
    this.attrs.rotation = value;
  }

  scaleX(value) {
    if (value == null) return this.attrs.scaleX;
    this.attrs.scaleX = value;
  }

  scaleY(value) {
    if (value == null) return this.attrs.scaleY;
    this.attrs.scaleY = value;
  }

  visible(value) {
    if (value == null) return this.attrs.visible;
    this.attrs.visible = value;
  }

  opacity(value) {
    if (value == null) return this.attrs.opacity;
    this.attrs.opacity = value;
  }

  setAttrs(nextAttrs) {
    this.attrs = {
      ...this.attrs,
      ...nextAttrs,
    };
  }

  setAttr(key, value) {
    this.attrs[key] = value;
  }

  getAttr(key) {
    return this.attrs[key];
  }
}

class ExampleComponent extends BaseComponent {
  static type = "example";

  async createNode(payload = {}) {
    return new FakeNode({
      name: "custom-node",
      draggable: true,
      x: payload.x,
      y: payload.y,
      label: payload.label,
    });
  }

  serializeNode(node) {
    return {
      label: node.getAttr("label"),
    };
  }

  async applySerializedData(node, data = {}) {
    node.setAttr("label", data.label ?? "");
  }
}

describe("base classes", () => {
  it("assigns component metadata when creating nodes", async () => {
    const component = new ExampleComponent({});

    const node = await component.create({});

    expect(node.getAttr("componentType")).toBe("example");
    expect(node.getAttr("baseDraggable")).toBe(true);
    expect(node.name()).toContain("selectable");
    expect(node.id()).toMatch(/^example-\d+$/);
    expect(node.getAttr("id")).toMatch(/^example-\d+$/);
  });

  it("preserves requested ids and restores serialized component state", async () => {
    const component = new ExampleComponent({});
    const node = await component.create({
      id: "example-42",
      x: 10,
      y: 20,
      label: "Before",
    });

    node.position({ x: 120, y: 240 });
    node.rotation(30);
    node.scaleX(2);
    node.scaleY(3);
    node.visible(false);
    node.opacity(0.5);
    node.setAttr("focusPositionMode", "relative");
    node.setAttr("savedFocus", {
      positionMode: "relative",
      offset: { x: 12, y: 18 },
      scale: 0.8,
    });
    node.setAttr("label", "After");

    const snapshot = component.serialize(node, { parentId: "container-7" });
    const restored = await component.restore(snapshot);

    expect(snapshot).toMatchObject({
      id: "example-42",
      type: "example",
      parentId: "container-7",
      x: 120,
      y: 240,
      rotation: 30,
      scaleX: 2,
      scaleY: 3,
      visible: false,
      opacity: 0.5,
      focusPositionMode: "relative",
      data: {
        label: "After",
      },
    });

    expect(restored.getAttr("id")).toBe("example-42");
    expect(restored.position()).toEqual({ x: 120, y: 240 });
    expect(restored.rotation()).toBe(30);
    expect(restored.scaleX()).toBe(2);
    expect(restored.scaleY()).toBe(3);
    expect(restored.visible()).toBe(false);
    expect(restored.opacity()).toBe(0.5);
    expect(restored.getAttr("focusPositionMode")).toBe("relative");
    expect(restored.getAttr("savedFocus")).toEqual({
      positionMode: "relative",
      offset: { x: 12, y: 18 },
      scale: 0.8,
    });
    expect(restored.getAttr("label")).toBe("After");
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
