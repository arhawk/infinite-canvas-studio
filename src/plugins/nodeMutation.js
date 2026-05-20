export async function withTrackedNodeMutation(app, node, mutate) {
  if (!app?.events || !node || typeof mutate !== "function") return false;

  app.events.emit("node:change:start", { node });
  try {
    await mutate();
    app.events.emit("node:changed", { node });
    return true;
  } catch (error) {
    throw error;
  }
}
