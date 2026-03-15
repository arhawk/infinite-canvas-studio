function toInstance(entry, Type, args) {
  return entry instanceof Type ? entry : new entry(...args);
}

let componentNodeCount = 0;

function nextComponentNodeId(prefix) {
  componentNodeCount += 1;
  return `${prefix}-${componentNodeCount}`;
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
    this.registerComponents(this.components());
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

  components() {
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

  registerComponent(entry) {
    const component = toInstance(entry, BaseComponent, [this.app, this]);
    this.app.components.register(component);
    this.cleanups.push(() => this.app.components.unregister(component.type));
    return component;
  }

  registerComponents(entries) {
    return entries.map((entry) => this.registerComponent(entry));
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
  constructor(app, plugin = null) {
    this.app = app;
    this.plugin = plugin;
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

    node.setAttrs({
      id: nextComponentNodeId(this.type),
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
    this.setValue(node, this.normalize(value, node));
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

export class FileEditorField extends BaseComponentEditorField {
  static fieldType = "file";

  normalize(value) {
    return value;
  }
}
