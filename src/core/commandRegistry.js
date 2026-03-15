export class CommandRegistry {
  constructor(app) {
    this.app = app;
    this.commands = new Map();
    this.featureCleanups = new Map();
  }

  register(command) {
    const feature = command.createModeFeature?.();
    if (feature) {
      this.featureCleanups.set(command.id, this.app.modeManager.register(feature));
    }
    this.commands.set(command.id, command);
  }

  unregister(id) {
    this.featureCleanups.get(id)?.();
    this.featureCleanups.delete(id);
    this.commands.delete(id);
  }

  execute(id, ...args) {
    const command = this.get(id);
    if (!command) {
      console.warn(`Command not found: ${id}`);
      return;
    }
    if (!command.isEnabled()) return;
    return command.execute(...args);
  }

  get(id) {
    return this.commands.get(id) ?? null;
  }

  list() {
    return [...this.commands.values()].map((command) => ({
      id: command.id,
      label: command.label,
    }));
  }
}
