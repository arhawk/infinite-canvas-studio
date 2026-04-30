function normalizeState(state) {
  if (!state) return null;

  return {
    enabled: state.enabled ?? true,
    config: state.config ?? {},
    onEnter: state.onEnter ?? null,
    onExit: state.onExit ?? null,
    onChange: state.onChange ?? null,
    tools: state.tools ?? null,
  };
}

function mergeStates(baseState, toolState, snapshot) {
  if (!baseState && !toolState) {
    return {
      key: `${snapshot.mode}:${snapshot.editorTool}:inactive`,
      enabled: false,
      config: {},
      onEnter: null,
      onExit: null,
      onChange: null,
    };
  }

  return {
    key: `${snapshot.mode}:${snapshot.editorTool}:${(baseState?.enabled ?? true) && (toolState?.enabled ?? true) ? "active" : "inactive"}`,
    enabled: (baseState?.enabled ?? true) && (toolState?.enabled ?? true),
    config: {
      ...(baseState?.config ?? {}),
      ...(toolState?.config ?? {}),
    },
    onEnter: toolState?.onEnter ?? baseState?.onEnter ?? null,
    onExit: toolState?.onExit ?? baseState?.onExit ?? null,
    onChange: toolState?.onChange ?? baseState?.onChange ?? null,
  };
}

class ModeFeature {
  constructor(descriptor) {
    this.id = descriptor.id;
    this.modes = descriptor.modes ?? {};
  }

  resolve(snapshot) {
    const baseState = normalizeState(this.modes[snapshot.mode]);
    if (!baseState) {
      return mergeStates(null, null, snapshot);
    }

    if (snapshot.mode === "edit" && baseState.tools) {
      const toolState = normalizeState(baseState.tools[snapshot.editorTool]);
      if (!toolState) {
        return {
          key: `${snapshot.mode}:${snapshot.editorTool}:inactive`,
          enabled: false,
          config: baseState.config,
          onEnter: null,
          onExit: null,
          onChange: null,
        };
      }
      return mergeStates(baseState, toolState, snapshot);
    }

    return mergeStates(baseState, null, snapshot);
  }
}

export class ModeManager {
  constructor({ eventBus, toolRegistry }) {
    this.eventBus = eventBus;
    this.toolRegistry = toolRegistry;
    this.mode = "edit";
    this.editorTool = "arrange";
    this.features = new Map();
  }

  getSnapshot() {
    return {
      mode: this.mode,
      editorTool: this.editorTool,
      activeToolId: this.mode === "edit" ? this.editorTool : null,
    };
  }

  getMode() {
    return this.mode;
  }

  getEditorTool() {
    return this.editorTool;
  }

  isReadOnly() {
    return this.mode === "presentation";
  }

  matches(query = {}) {
    if (query.mode && query.mode !== this.mode) return false;
    if (query.editorTool && query.editorTool !== this.editorTool) return false;
    return true;
  }

  register(descriptor) {
    const feature = new ModeFeature(descriptor);
    this.features.set(feature.id, feature);
    this.#notifySingle(null, feature.resolve(this.getSnapshot()), feature.id);
    return () => this.unregister(feature.id);
  }

  unregister(id) {
    const feature = this.features.get(id);
    if (!feature) return;
    const current = feature.resolve(this.getSnapshot());
    if (current.enabled) {
      current.onExit?.(this.#createContext(id, current, null));
    }
    this.features.delete(id);
  }

  isEnabled(id) {
    const feature = this.features.get(id);
    if (!feature) return false;
    return feature.resolve(this.getSnapshot()).enabled;
  }

  getConfig(id) {
    const feature = this.features.get(id);
    if (!feature) return {};
    return feature.resolve(this.getSnapshot()).config;
  }

  setMode(mode) {
    if (!["presentation", "edit"].includes(mode) || mode === this.mode) return;
    this.#transition(() => {
      this.mode = mode;
      this.editorTool = this.#normalizeEditorTool(this.editorTool, mode);
    });
  }

  setEditorTool(toolId) {
    if (!this.toolRegistry.has(toolId)) return;
    const nextToolId = this.#normalizeEditorTool(toolId, this.mode);
    if (nextToolId === this.editorTool) return;
    this.#transition(() => {
      this.editorTool = nextToolId;
    });
  }

  sync() {
    this.#syncTool();
    this.eventBus.emit("interaction:change", this.getSnapshot());
    this.#notifyAll(new Map());
  }

  #transition(mutator) {
    const previousSnapshot = this.getSnapshot();
    const previousStates = this.#resolveStates(previousSnapshot);
    mutator();
    const nextSnapshot = this.getSnapshot();
    this.#syncTool();
    if (previousSnapshot.mode !== nextSnapshot.mode) {
      this.eventBus.emit("mode:change", { mode: nextSnapshot.mode });
    }
    if (previousSnapshot.editorTool !== nextSnapshot.editorTool) {
      this.eventBus.emit("editor-tool:change", { toolId: nextSnapshot.editorTool });
    }
    this.eventBus.emit("interaction:change", nextSnapshot);
    this.#notifyAll(previousStates);
  }

  #syncTool() {
    const toolId = this.mode === "edit" ? this.editorTool : null;
    this.toolRegistry.setActive(toolId);
  }

  #resolveStates(snapshot) {
    const states = new Map();
    for (const [id, feature] of this.features.entries()) {
      states.set(id, feature.resolve(snapshot));
    }
    return states;
  }

  #notifyAll(previousStates) {
    for (const [id, feature] of this.features.entries()) {
      this.#notifySingle(previousStates.get(id) ?? null, feature.resolve(this.getSnapshot()), id);
    }
  }

  #notifySingle(previousState, nextState, id) {
    const changed = !previousState || previousState.key !== nextState.key;
    if (previousState?.enabled && changed) {
      previousState.onExit?.(this.#createContext(id, previousState, nextState));
    }
    if (nextState.enabled && changed) {
      nextState.onEnter?.(this.#createContext(id, nextState, previousState));
    }
    if (nextState.enabled && (changed || !previousState)) {
      nextState.onChange?.(this.#createContext(id, nextState, previousState));
    }
  }

  #createContext(id, state, previousState) {
    return {
      id,
      snapshot: this.getSnapshot(),
      config: state?.config ?? {},
      previousConfig: previousState?.config ?? {},
      manager: this,
    };
  }

  #normalizeEditorTool(toolId, mode) {
    if (mode !== "presentation") return toolId;
    return "arrange";
  }
}
