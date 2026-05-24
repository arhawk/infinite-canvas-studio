export function installKonvaMock(vi) {
  vi.mock("../../../src/lib/konva.js", () => {
    class FakeNode {
      constructor(config = {}) {
        this._attrs = {
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          opacity: 1,
          ...config,
        };
        this._children = [];
      }

      add(...children) {
        this._children.push(...children);
        return this;
      }

      findOne(selector) {
        if (typeof selector !== "string" || !selector.startsWith(".")) return null;
        const className = selector.slice(1);
        return this._children.find((child) => (
          child.name().split(" ").includes(className)
        )) ?? null;
      }

      findAncestor() { return null; }
      on() {}
      off() {}
      getLayer() { return { batchDraw() {} }; }

      name(value) {
        if (value == null) return this._attrs.name ?? "";
        this._attrs.name = value;
        return this;
      }

      id() { return this._attrs.id; }
      draggable() { return this._attrs.draggable ?? false; }
      hasName(name) { return this.name().split(" ").includes(name); }
      setAttrs(nextAttrs) { Object.assign(this._attrs, nextAttrs); }
      setAttr(key, value) { this._attrs[key] = value; }
      getAttr(key) { return this._attrs[key]; }

      width(value) { if (value == null) return this._attrs.width ?? 0; this._attrs.width = value; return this; }
      height(value) { if (value == null) return this._attrs.height ?? 0; this._attrs.height = value; return this; }
      x(value) { if (value == null) return this._attrs.x ?? 0; this._attrs.x = value; return this; }
      y(value) { if (value == null) return this._attrs.y ?? 0; this._attrs.y = value; return this; }
      position(next) {
        if (!next) return { x: this.x(), y: this.y() };
        this.x(next.x); this.y(next.y); return this;
      }
      rotation(value) { if (value == null) return this._attrs.rotation; this._attrs.rotation = value; return this; }
      scaleX(value) { if (value == null) return this._attrs.scaleX; this._attrs.scaleX = value; return this; }
      scaleY(value) { if (value == null) return this._attrs.scaleY; this._attrs.scaleY = value; return this; }
      scale(value) {
        if (!value) return { x: this.scaleX(), y: this.scaleY() };
        this.scaleX(value.x); this.scaleY(value.y); return this;
      }
      visible(value) { if (value == null) return this._attrs.visible; this._attrs.visible = value; return this; }
      opacity(value) { if (value == null) return this._attrs.opacity; this._attrs.opacity = value; return this; }
      points(value) { if (value == null) return this._attrs.points ?? []; this._attrs.points = value; return this; }
      fill(value) { if (value == null) return this._attrs.fill ?? ""; this._attrs.fill = value; return this; }
      stroke(value) { if (value == null) return this._attrs.stroke ?? ""; this._attrs.stroke = value; return this; }
      strokeWidth(value) { if (value == null) return this._attrs.strokeWidth ?? 0; this._attrs.strokeWidth = value; return this; }
      text(value) { if (value == null) return this._attrs.text ?? ""; this._attrs.text = value; return this; }
      fontSize(value) { if (value == null) return this._attrs.fontSize ?? 0; this._attrs.fontSize = value; return this; }
      fontStyle(value) { if (value == null) return this._attrs.fontStyle ?? "400"; this._attrs.fontStyle = value; return this; }
      padding(value) { if (value == null) return this._attrs.padding ?? 0; this._attrs.padding = value; return this; }
      lineHeight(value) { if (value == null) return this._attrs.lineHeight ?? 1; this._attrs.lineHeight = value; return this; }
      wrap(value) { if (value == null) return this._attrs.wrap ?? "none"; this._attrs.wrap = value; return this; }
      verticalAlign(value) { if (value == null) return this._attrs.verticalAlign ?? "top"; this._attrs.verticalAlign = value; return this; }
      ellipsis(value) { if (value == null) return this._attrs.ellipsis ?? false; this._attrs.ellipsis = value; return this; }
      listening(value) { if (value == null) return this._attrs.listening ?? true; this._attrs.listening = value; return this; }
    }

    class FakeGroup extends FakeNode {}
    class FakeRect extends FakeNode {}
    class FakeLine extends FakeNode {}
    class FakeText extends FakeNode {}

    return {
      Konva: {
        Group: FakeGroup,
        Rect: FakeRect,
        Line: FakeLine,
        Text: FakeText,
      },
    };
  });
}

