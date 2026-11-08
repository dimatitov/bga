/** Inline SVG string → `data:image/svg+xml` URL usable as `<img src>` (covers from a game's `./assets`). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
