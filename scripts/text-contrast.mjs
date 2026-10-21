// Flat-surface text check, not a substitute for an assistive-technology audit.
// Self-contained so Playwright can evaluate it in the browser.
export function textContrast() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true }),
    cache = new Map();
  const rgba = (color) => {
    if (!cache.has(color)) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      cache.set(color, [...context.getImageData(0, 0, 1, 1).data]);
    }
    return cache.get(color);
  };
  const composite = (front, back) =>
    front.slice(0, 3).map((c, i) => (c * front[3]) / 255 + back[i] * (1 - front[3] / 255));
  const luminance = (color) =>
    color
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i], 0);
  const issues = [];
  let checked = 0;
  for (const element of document.querySelectorAll(
    "main h1,main h2,main h3,main p,main label,main a,main button,main dt,main dd,main summary,main span",
  )) {
    const rect = element.getBoundingClientRect(),
      style = getComputedStyle(element);
    if (
      rect.width < 2 ||
      rect.height < 2 ||
      style.visibility !== "visible" ||
      element.closest("[aria-hidden=true],:disabled,fieldset[disabled]") ||
      ![...element.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    )
      continue;
    const ancestors = [];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement)
      ancestors.unshift(ancestor);
    if (ancestors.some((a) => Number(getComputedStyle(a).opacity) < 1)) continue;
    let background = [0, 0, 0];
    for (const ancestor of ancestors)
      background = composite(rgba(getComputedStyle(ancestor).backgroundColor), background);
    const foreground = composite(rgba(style.color), background),
      a = luminance(foreground),
      b = luminance(background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(style.fontSize),
      minimum = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
    checked++;
    if (ratio + 0.01 < minimum)
      issues.push({ tag: element.tagName, ratio: Number(ratio.toFixed(2)), minimum });
  }
  return { checked, issues };
}
