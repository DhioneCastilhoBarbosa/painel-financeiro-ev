/** Resolve CSS custom properties (var(--x)) to their computed values. */
function resolveCSSVars(root: Element): void {
  const docStyle = getComputedStyle(document.documentElement);
  const varRe = /var\(--([^)]+)\)/g;

  function resolveValue(raw: string): string {
    return raw.replace(varRe, (_, name) => {
      const resolved = docStyle.getPropertyValue(`--${name.trim()}`).trim();
      // Guard against nested var() or empty resolution
      return resolved && !resolved.includes("var(") ? resolved : raw;
    });
  }

  function walk(el: Element) {
    // Resolve presentation attributes (stroke, fill, stop-color, etc.)
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes("var(--")) {
        attr.value = resolveValue(attr.value);
      }
    }
    // Resolve inline style properties
    const style = (el as SVGElement).style;
    if (style) {
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        const val = style.getPropertyValue(prop);
        if (val.includes("var(--")) {
          style.setProperty(prop, resolveValue(val));
        }
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  }

  walk(root);
}

export async function downloadChartAsPNG(
  containerEl: HTMLElement,
  filename = "chart"
): Promise<void> {
  const svg = containerEl.querySelector("svg");
  if (!svg) return;

  const { width, height } = svg.getBoundingClientRect();
  const scale = 3; // ~288 DPI at 96 DPI screen ≈ 300 DPI

  // Clone SVG and fix dimensions for standalone rendering
  const cloned = svg.cloneNode(true) as SVGElement;
  cloned.setAttribute("width", String(width));
  cloned.setAttribute("height", String(height));
  cloned.style.border = "none";
  cloned.style.outline = "none";
  cloned.style.boxShadow = "none";

  // Resolve CSS variables BEFORE serializing — XMLSerializer can't resolve them
  resolveCSSVars(cloned);

  const FONT_STACK =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

  // Inline computed styles on text elements so they render correctly off-screen
  svg.querySelectorAll("text, tspan").forEach((el, i) => {
    const src = el as SVGElement;
    const dst = cloned.querySelectorAll("text, tspan")[i] as SVGElement | undefined;
    if (!dst) return;
    const cs = getComputedStyle(src);
    dst.style.fontFamily = FONT_STACK;
    dst.style.fontSize = cs.fontSize;
    dst.style.fill = cs.fill || "#000";
  });

  const svgString = new XMLSerializer().serializeToString(cloned);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) { URL.revokeObjectURL(url); return; }

  ctx.scale(scale, scale);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) { resolve(); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download = `${filename}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        resolve();
      }, "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}
