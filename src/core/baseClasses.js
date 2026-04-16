import { normalizeAttachmentState } from "../attachments/model.js";

function toInstance(entry, Type, args) {
  return entry instanceof Type ? entry : new entry(...args);
}

let componentNodeCount = 0;

function nextComponentNodeId(prefix) {
  componentNodeCount += 1;
  return `${prefix}-${componentNodeCount}`;
}

function syncComponentNodeCount(id) {
  if (typeof id !== "string") return;
  const match = id.match(/-(\d+)$/);
  if (!match) return;
  componentNodeCount = Math.max(componentNodeCount, Number(match[1]));
}

function clonePlainData(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export class ModeAware {
  constructor(app) {
    this.app = app;
  }

  get id() {
    return this.constructor.id ?? this.constructor.pluginId ?? this.constructor.commandId ?? this.constructor.itemId ?? this.constructor.toolId ?? this.constructor.type;
  }

  get label() {
    return this.constructor.label ?? this.id;
  }

  get modes() {
    return this.constructor.modes ?? null;
  }

  get featureId() {
    return this.constructor.featureId ?? this.id;
  }

  createModeFeature() {
    if (!this.modes) return null;

    return {
      id: this.featureId,
      modes: this.modes,
      onEnter: (ctx) => this.onModeEnter(ctx),
      onExit: (ctx) => this.onModeExit(ctx),
      onChange: (ctx) => this.onModeChange(ctx),
    };
  }

  isEnabled() {
    return !this.modes || this.app.modeManager.isEnabled(this.featureId);
  }

  getModeConfig() {
    return this.modes ? this.app.modeManager.getConfig(this.featureId) : {};
  }

  onModeEnter() {}

  onModeExit() {}

  onModeChange() {}
}

export class BasePlugin extends ModeAware {
  constructor(app, options = {}) {
    super(app);
    this.options = options;
    this.cleanups = [];
  }

  setup() {
    this.registerTools(this.tools());
    this.registerCommands(this.commands());
    this.registerMenuItems(this.menuItems());
    this.onSetup();
    this.#registerOwnModeFeature();
  }

  destroy() {
    this.onDestroy();
    for (const cleanup of this.cleanups.reverse()) {
      cleanup();
    }
    this.cleanups.length = 0;
  }

  tools() {
    return [];
  }

  commands() {
    return [];
  }

  menuItems() {
    return [];
  }

  onSetup() {}

  onDestroy() {}

  registerTool(entry) {
    const tool = toInstance(entry, BaseTool, [this.app, this]);
    this.app.tools.register(tool);
    this.cleanups.push(() => this.app.tools.unregister(tool.id));
    return tool;
  }

  registerTools(entries) {
    return entries.map((entry) => this.registerTool(entry));
  }

  registerCommand(entry) {
    const command = toInstance(entry, BaseCommand, [this.app, this]);
    this.app.commands.register(command);
    this.cleanups.push(() => this.app.commands.unregister(command.id));
    return command;
  }

  registerCommands(entries) {
    return entries.map((entry) => this.registerCommand(entry));
  }

  registerMenuItem(entry) {
    const item = toInstance(entry, BaseContextMenuItem, [this.app, this]);
    this.app.contextMenu.register(item);
    this.cleanups.push(() => this.app.contextMenu.unregister(item.id));
    return item;
  }

  registerMenuItems(entries) {
    return entries.map((entry) => this.registerMenuItem(entry));
  }

  registerFeature(descriptor) {
    const off = this.app.modeManager.register(descriptor);
    this.cleanups.push(off);
    return off;
  }

  listen(event, handler) {
    const off = this.app.on(event, handler);
    this.cleanups.push(off);
    return off;
  }

  listenDom(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this.cleanups.push(() => target.removeEventListener(event, handler, options));
  }

  #registerOwnModeFeature() {
    const feature = this.createModeFeature();
    if (!feature) return;
    this.registerFeature(feature);
  }
}

export class BaseTool extends ModeAware {
  constructor(app, plugin = null) {
    super(app);
    this.plugin = plugin;
  }

  get id() {
    return this.constructor.toolId;
  }

  activate() {
    this.onActivate();
  }

  deactivate() {
    this.onDeactivate();
  }

  onActivate() {}

  onDeactivate() {}
}

export class BaseCommand extends ModeAware {
  constructor(app, plugin = null) {
    super(app);
    this.plugin = plugin;
  }

  get id() {
    return this.constructor.commandId;
  }

  execute() {
    throw new Error(`${this.id} must implement execute()`);
  }
}

export class BaseContextMenuItem extends ModeAware {
  constructor(app, plugin = null) {
    super(app);
    this.plugin = plugin;
  }

  get id() {
    return this.constructor.itemId;
  }

  isVisible() {
    return this.isEnabled();
  }

  condition() {
    return true;
  }

  execute() {
    throw new Error(`${this.id} must implement execute()`);
  }
}

export class BaseComponent {
  constructor(app) {
    this.app = app;
  }

  get type() {
    return this.constructor.type;
  }

  get label() {
    return this.constructor.label ?? this.type;
  }

  get description() {
    return this.constructor.description ?? "";
  }

  get palette() {
    return this.constructor.palette !== false;
  }

  // Attachment support stays opt-in per component so existing components
  // keep their current serialization contract unchanged.
  supportsAttachments() {
    return this.constructor.attachments === true;
  }

  getEditorTitle() {
    return `${this.label} Editor`;
  }

  getEditorDescription() {
    return this.description;
  }

  editorFields() {
    return [];
  }

  getEditorDefinition(node) {
    const fields = this.editorFields(node).filter(Boolean);
    if (!fields.length) return null;

    return {
      title: this.getEditorTitle(node),
      description: this.getEditorDescription(node),
      fields,
    };
  }

  async create(payload) {
    const node = await this.createNode(payload);
    if (!node) return null;
    const currentName = node.name() || "";
    const names = currentName.split(" ").filter(Boolean);
    if (!names.includes("selectable")) {
      names.push("selectable");
    }
    const finalName = names.join(" ");
    const requestedId =
      typeof payload?.id === "string" && payload.id ? payload.id : nextComponentNodeId(this.type);

    syncComponentNodeCount(requestedId);

    node.setAttrs({
      id: requestedId,
      name: finalName,
      componentType: this.type,
      baseDraggable: node.draggable(),
    });
    this.onCreated(node, payload);
    return node;
  }

  async createNode() {
    throw new Error(`${this.type} must implement createNode()`);
  }

  onCreated() {}

  serialize(node, { parentId = null } = {}) {
    if (!node?.hasName?.("selectable")) return null;

    const serializedData = clonePlainData(this.serializeNode(node)) ?? {};
    // Attachments travel with component data so JSON save/load and exported
    // HTML reuse the existing document roundtrip without schema changes.
    if (this.supportsAttachments(node)) {
      serializedData.attachments = this.getAttachmentState(node);
    }

    return {
      id: node.id(),
      type: this.type,
      parentId,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      visible: node.visible(),
      opacity: node.opacity(),
      focusPositionMode: node.getAttr("focusPositionMode") ?? null,
      savedFocus: clonePlainData(node.getAttr("savedFocus") ?? null),
      data: serializedData,
    };
  }

  serializeNode() {
    return {};
  }

  getRestorePayload(snapshot = {}) {
    return {
      x: snapshot.x ?? 0,
      y: snapshot.y ?? 0,
      id: snapshot.id,
      ...(clonePlainData(snapshot.data) ?? {}),
    };
  }

  async restore(snapshot = {}) {
    const node = await this.create(this.getRestorePayload(snapshot));
    if (!node) return null;
    await this.applySerializedData(node, snapshot.data ?? {});
    // Restore attachment metadata after component data so attachment-capable
    // components can stay focused on their own visual fields.
    if (this.supportsAttachments(node)) {
      this.setAttachmentState(node, snapshot.data?.attachments ?? null);
    }
    this.applySerializedState(node, snapshot);
    return node;
  }

  async applySerializedData() {}

  getAttachmentState(node) {
    if (!this.supportsAttachments(node)) return null;
    return normalizeAttachmentState(node?.getAttr("attachments"));
  }

  setAttachmentState(node, state) {
    if (!this.supportsAttachments(node) || !node?.setAttr) return;
    node.setAttr("attachments", normalizeAttachmentState(state));
  }

  applySerializedState(node, snapshot = {}) {
    if (!node) return;

    node.position({
      x: Number.isFinite(snapshot.x) ? snapshot.x : 0,
      y: Number.isFinite(snapshot.y) ? snapshot.y : 0,
    });
    node.rotation(Number.isFinite(snapshot.rotation) ? snapshot.rotation : 0);
    node.scaleX(Number.isFinite(snapshot.scaleX) ? snapshot.scaleX : 1);
    node.scaleY(Number.isFinite(snapshot.scaleY) ? snapshot.scaleY : 1);
    node.visible(snapshot.visible !== false);
    node.opacity(Number.isFinite(snapshot.opacity) ? snapshot.opacity : 1);

    if (snapshot.focusPositionMode != null) {
      node.setAttr("focusPositionMode", snapshot.focusPositionMode);
    }

    if (Object.hasOwn(snapshot, "savedFocus")) {
      node.setAttr("savedFocus", clonePlainData(snapshot.savedFocus) ?? null);
    }
  }
}

export class BaseComponentEditorField {
  constructor({
    id,
    label,
    description = "",
    placeholder = "",
    input = {},
    getValue = () => "",
    setValue = () => {},
  }) {
    this.id = id;
    this.label = label;
    this.description = description;
    this.placeholder = placeholder;
    this.input = input;
    this.getValue = getValue;
    this.setValue = setValue;
  }

  get type() {
    return this.constructor.fieldType ?? "text";
  }

  read(node) {
    return this.getValue(node);
  }

  write(node, value) {
    return this.setValue(node, this.normalize(value, node));
  }

  normalize(value) {
    return value;
  }

  getInputAttributes() {
    return this.input;
  }
}

export class TextEditorField extends BaseComponentEditorField {
  static fieldType = "text";

  normalize(value) {
    return String(value ?? "");
  }
}

export class TextareaEditorField extends BaseComponentEditorField {
  static fieldType = "textarea";

  constructor(options = {}) {
    super(options);
    this.rows = options.rows ?? 4;
  }

  normalize(value) {
    return String(value ?? "");
  }
}

export class NumberEditorField extends BaseComponentEditorField {
  static fieldType = "number";

  normalize(value, node) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return Number(this.read(node)) || 0;
    }

    const min = this.input.min != null ? Number(this.input.min) : null;
    const max = this.input.max != null ? Number(this.input.max) : null;
    let nextValue = parsed;

    if (min != null) nextValue = Math.max(min, nextValue);
    if (max != null) nextValue = Math.min(max, nextValue);

    return nextValue;
  }
}

export class ColorEditorField extends BaseComponentEditorField {
  static fieldType = "color";

  normalize(value) {
    return String(value ?? "#000000");
  }
}

export class CheckboxEditorField extends BaseComponentEditorField {
  static fieldType = "checkbox";

  normalize(value) {
    return value === true || value === "true" || value === "on" || value === "1";
  }
}

export class FileEditorField extends BaseComponentEditorField {
  static fieldType = "file";

  normalize(value) {
    return value;
  }
}
