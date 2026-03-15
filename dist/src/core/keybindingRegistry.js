function parseShortcut(shortcut) {
  const parts = shortcut.toLowerCase().split("+").map((s) => s.trim());
  return {
    ctrl: parts.includes("ctrl") || parts.includes("cmd") || parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: parts.filter(
      (p) => !["ctrl", "cmd", "mod", "shift", "alt"].includes(p),
    )[0],
  };
}

function matchesEvent(parsed, event) {
  const modifierMatch =
    parsed.ctrl === (event.metaKey || event.ctrlKey) &&
    parsed.shift === event.shiftKey &&
    parsed.alt === event.altKey;

  return modifierMatch && event.key.toLowerCase() === parsed.key;
}

export class KeybindingRegistry {
  constructor(commandRegistry) {
    this.commandRegistry = commandRegistry;
    this.bindings = new Map();
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
  }

  register(shortcut, commandId) {
    this.bindings.set(shortcut, {
      parsed: parseShortcut(shortcut),
      commandId,
    });
  }

  unregister(shortcut) {
    this.bindings.delete(shortcut);
  }

  list() {
    return [...this.bindings.entries()].map(([shortcut, { commandId }]) => ({
      shortcut,
      commandId,
    }));
  }

  onKeyDown(event) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    for (const { parsed, commandId } of this.bindings.values()) {
      if (matchesEvent(parsed, event)) {
        event.preventDefault();
        this.commandRegistry.execute(commandId);
        return;
      }
    }
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
  }
}
