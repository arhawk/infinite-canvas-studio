import { renderIcons } from "../../lib/icons.js";

function createButton({
  id = "",
  className = "",
  icon = "",
  label = "",
  testId = "",
  pressed = null,
}) {
  const button = document.createElement("button");
  button.type = "button";
  if (id) {
    button.id = id;
  }
  button.className = className;
  button.setAttribute("aria-label", label);
  button.title = label;
  if (testId) {
    button.dataset.testid = testId;
  }
  if (pressed != null) {
    button.setAttribute("aria-pressed", String(pressed));
  }

  const iconEl = document.createElement("i");
  iconEl.dataset.lucide = icon;
  iconEl.setAttribute("aria-hidden", "true");
  button.append(iconEl);

  return button;
}

function createDivider() {
  const divider = document.createElement("div");
  divider.className = "left-toolbar__divider";
  divider.setAttribute("aria-hidden", "true");
  return divider;
}

export function registerLeftToolbar(host) {
  if (!host) {
    throw new Error("LeftToolbar host is required.");
  }

  const existing = document.getElementById("left-toolbar");
  if (existing) {
    return existing;
  }

  document.body.classList.add("has-left-toolbar");

  const root = document.createElement("aside");
  root.id = "left-toolbar";
  root.className = "left-toolbar";
  root.setAttribute("aria-label", "Canvas tools");
  root.dataset.testid = "left-toolbar";

  const logo = document.createElement("div");
  logo.className = "left-toolbar__logo";
  logo.textContent = "Mimi";
  root.append(logo);

  const toolsGroup = document.createElement("div");
  toolsGroup.id = "tool-buttons";
  toolsGroup.className = "left-toolbar__group left-toolbar__group--tools";
  toolsGroup.dataset.testid = "tool-buttons";
  root.append(toolsGroup);

  root.append(createDivider());

  const componentsButton = createButton({
    id: "components-placeholder-action",
    className: "ghost-button ghost-button--icon-only left-toolbar__icon-button",
    icon: "layout-grid",
    label: "Components",
    testId: "components-placeholder-action",
    pressed: false,
  });
  componentsButton.addEventListener("click", () => {
    const nextPressed = componentsButton.getAttribute("aria-pressed") !== "true";
    componentsButton.setAttribute("aria-pressed", String(nextPressed));
  });
  root.append(componentsButton);

  root.append(createDivider());

  const pluginGroup = document.createElement("div");
  pluginGroup.className = "left-toolbar__group";
  pluginGroup.append(
    createButton({
      id: "calculator-toggle",
      className: "ghost-button ghost-button--icon-only left-toolbar__icon-button",
      icon: "calculator",
      label: "Binary Calculator",
      testId: "calculator-toggle",
      pressed: false,
    }),
    createButton({
      id: "timer-toggle",
      className: "ghost-button ghost-button--icon-only left-toolbar__icon-button",
      icon: "timer",
      label: "Timer / Stopwatch",
      testId: "timer-toggle",
      pressed: false,
    }),
  );
  root.append(pluginGroup);

  const spacer = document.createElement("div");
  spacer.className = "left-toolbar__spacer";
  root.append(spacer);

  const historyGroup = document.createElement("div");
  historyGroup.id = "history-controls";
  historyGroup.className = "left-toolbar__group";
  historyGroup.dataset.testid = "history-controls";
  historyGroup.append(
    createButton({
      id: "undo-action",
      className: "ghost-button ghost-button--icon-only left-toolbar__icon-button",
      icon: "undo-2",
      label: "Undo",
      testId: "undo-action",
    }),
    createButton({
      id: "redo-action",
      className: "ghost-button ghost-button--icon-only left-toolbar__icon-button",
      icon: "redo-2",
      label: "Redo",
      testId: "redo-action",
    }),
  );
  root.append(historyGroup);

  host.prepend(root);
  renderIcons(root, {
    width: 16,
    height: 16,
    "stroke-width": 2,
  });
  return root;
}
