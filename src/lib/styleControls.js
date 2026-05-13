export function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

export function formatPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export function syncOpacityUi({
  sliderEl,
  outputEl,
  triggerEl = null,
  triggerLabel = "Card color",
  value,
}) {
  const opacity = clamp01(value);
  const percent = formatPercent(opacity);
  if (sliderEl) {
    sliderEl.value = opacity.toFixed(2);
    sliderEl.title = `Opacity: ${percent}`;
  }
  if (outputEl) {
    outputEl.textContent = percent;
    outputEl.title = `Opacity: ${percent}`;
  }
  if (triggerEl) {
    triggerEl.style.setProperty("--button-tool-opacity", String(opacity));
    triggerEl.title = `${triggerLabel} (Opacity: ${percent})`;
  }
}
