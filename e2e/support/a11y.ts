/// <reference lib="dom" />
// SWR-004 visual/a11y helpers without new dependencies (TR-9, Q-23: no @axe-core/playwright):
// WCAG 2.x relative luminance / contrast ratio on computed colours, focus-indicator check, layout overflow checks.
import { expect, type Locator, type Page } from '@playwright/test';

export type RGBA = [number, number, number, number];

/** Parses a computed CSS colour (`rgb()` / `rgba()`, space or comma syntax; `transparent`). */
export function parseColor(css: string): RGBA {
  const c = css.trim();
  if (c === 'transparent') return [0, 0, 0, 0];
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
    c,
  );
  if (!m) throw new Error(`unsupported computed colour "${css}" (expected rgb/rgba)`);
  const alphaRaw = m[4];
  const alpha =
    alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith('%')
        ? Number(alphaRaw.slice(0, -1)) / 100
        : Number(alphaRaw);
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

/** Source-over compositing of `top` onto an opaque-or-not `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top[3] + bottom[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const ch = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
  return [ch(0), ch(1), ch(2), a];
}

/** WCAG 2.x relative luminance of an sRGB colour (alpha ignored — composite first). */
export function relativeLuminance([r, g, b]: RGBA): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1…21). */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

interface RawStyles {
  color: string;
  outlineColor: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  boxShadow: string;
  fontSize: number;
  fontWeight: number;
  /** background colours from the root (`html`) down to the element itself */
  backgrounds: string[];
  /** product of `opacity` of the element and its ancestors */
  opacity: number;
}

async function rawStyles(loc: Locator): Promise<RawStyles> {
  return loc.evaluate((el) => {
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.push(n);
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      outlineColor: cs.outlineColor,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: Number(cs.fontWeight) || 400,
      backgrounds: chain.reverse().map((n) => getComputedStyle(n).backgroundColor),
      opacity: chain.reduce((acc, n) => acc * Number(getComputedStyle(n).opacity || '1'), 1),
    };
  });
}

/** Effective (composited) background behind an element; background images are ignored (none in these screens). */
function effectiveBackground(raw: RawStyles): RGBA {
  return raw.backgrounds.reduce<RGBA>(
    (bg, css) => composite(parseColor(css), bg),
    [255, 255, 255, 1],
  );
}

export interface ContrastResult {
  ratio: number;
  fg: RGBA;
  bg: RGBA;
  large: boolean;
}

/** Text contrast of an element against its effective background (computed styles, inherited backgrounds). */
export async function measureTextContrast(loc: Locator): Promise<ContrastResult> {
  const raw = await rawStyles(loc);
  const bg = effectiveBackground(raw);
  const color = parseColor(raw.color);
  const fg = composite([color[0], color[1], color[2], color[3] * raw.opacity], bg);
  // WCAG "large text": ≥ 24 px, or ≥ 18.66 px bold.
  const large = raw.fontSize >= 24 || (raw.fontSize >= 18.66 && raw.fontWeight >= 700);
  return { ratio: contrastRatio(fg, bg), fg, bg, large };
}

/** TC-VA-11: ≥ 4.5:1 for normal text, ≥ 3:1 for large text (or an explicit minimum). */
export async function expectTextContrast(loc: Locator, label: string, min?: number): Promise<void> {
  await expect(loc, `${label} is visible`).toBeVisible();
  const r = await measureTextContrast(loc);
  const required = min ?? (r.large ? 3 : 4.5);
  expect(
    r.ratio,
    `${label}: contrast ${r.ratio.toFixed(2)}:1 (fg ${r.fg.map((v) => Math.round(v)).join(',')} on bg ${r.bg
      .map((v) => Math.round(v))
      .join(',')}) must be ≥ ${required}:1`,
  ).toBeGreaterThanOrEqual(required);
}

/** Non-text contrast (WCAG 1.4.11) of a border colour against the element's parent background. */
export async function expectBorderContrast(loc: Locator, label: string, min = 3): Promise<void> {
  const { border, parentBgs } = await loc.evaluate((el) => {
    const chain: Element[] = [];
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) chain.push(n);
    return {
      border: getComputedStyle(el).borderTopColor,
      parentBgs: chain.reverse().map((n) => getComputedStyle(n).backgroundColor),
    };
  });
  const bg = parentBgs.reduce<RGBA>(
    (acc, css) => composite(parseColor(css), acc),
    [255, 255, 255, 1],
  );
  const ratio = contrastRatio(composite(parseColor(border), bg), bg);
  expect(
    ratio,
    `${label}: border contrast ${ratio.toFixed(2)}:1 must be ≥ ${min}:1`,
  ).toBeGreaterThanOrEqual(min);
}

/**
 * Background behind a focus ring (spec "Decisions after TECH_PLANNING" → Focus ring): an outline is drawn outside the
 * border box shifted by `outline-offset`, so
 * - offset ≥ 0 → the ring lies on the surrounding background (ancestors only, not the element's own fill);
 * - offset ≤ −width → the ring lies entirely inside, on the element's own fill;
 * - otherwise it straddles the edge → both backgrounds are returned and each must pass.
 */
function ringBackgrounds(raw: RawStyles): RGBA[] {
  const width = parseFloat(raw.outlineWidth) || 0;
  const offset = parseFloat(raw.outlineOffset) || 0;
  const surrounding = effectiveBackground({ ...raw, backgrounds: raw.backgrounds.slice(0, -1) });
  const own = effectiveBackground(raw);
  if (offset >= 0) return [surrounding];
  if (offset <= -width) return [own];
  return [surrounding, own];
}

/**
 * TC-VA-10: the focused element shows a visible focus indicator (`:focus-visible` + outline or box-shadow), and an
 * outline has ≥ 3:1 contrast against the background the ring is actually drawn on (see {@link ringBackgrounds}).
 */
export async function expectVisibleFocus(loc: Locator, label: string): Promise<void> {
  await expect(loc, `${label} is focused`).toBeFocused();
  expect(await loc.evaluate((el) => el.matches(':focus-visible')), `${label} :focus-visible`).toBe(
    true,
  );
  const raw = await rawStyles(loc);
  const hasOutline = raw.outlineStyle !== 'none' && parseFloat(raw.outlineWidth) > 0;
  const hasShadow = raw.boxShadow !== 'none' && raw.boxShadow !== '';
  expect(hasOutline || hasShadow, `${label}: outline or box-shadow on focus`).toBe(true);
  if (hasOutline) {
    for (const bg of ringBackgrounds(raw)) {
      const ratio = contrastRatio(composite(parseColor(raw.outlineColor), bg), bg);
      expect(
        ratio,
        `${label}: focus ring contrast ${ratio.toFixed(2)}:1 (offset ${raw.outlineOffset}, bg ${bg
          .map((v) => Math.round(v))
          .join(',')}) ≥ 3:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
}

/** No horizontal page scroll (`documentElement.scrollWidth <= innerWidth`). */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `${label}: page scrollWidth ${scrollWidth} ≤ innerWidth ${innerWidth}`,
  ).toBeLessThanOrEqual(innerWidth);
}

/** The element's content is not clipped horizontally and its box is inside the viewport. */
export async function expectNotClipped(loc: Locator, label: string): Promise<void> {
  await expect(loc, `${label} is visible`).toBeVisible();
  const m = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      left: r.left,
      right: r.right,
      vw: document.documentElement.clientWidth,
    };
  });
  expect(
    m.scrollWidth,
    `${label}: content not clipped (scrollWidth ≤ clientWidth)`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
  expect(m.left, `${label}: left edge inside the viewport`).toBeGreaterThanOrEqual(-1);
  expect(m.right, `${label}: right edge inside the viewport`).toBeLessThanOrEqual(m.vw + 1);
}

/**
 * TC-VA-08 (D-1): the container does not overflow horizontally (`scrollWidth ≤ clientWidth`) and the bounding boxes
 * of its visible direct children do not intersect.
 */
export async function expectNoOverflowNorOverlap(container: Locator, label: string): Promise<void> {
  const m = await container.evaluate((el) => {
    const boxes = Array.from(el.children)
      .map((c) => {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        return {
          name: c.getAttribute('data-testid') ?? c.tagName.toLowerCase(),
          x: r.left,
          y: r.top,
          w: r.width,
          h: r.height,
          shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
        };
      })
      .filter((b) => b.shown);
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, boxes };
  });
  expect(
    m.scrollWidth,
    `${label}: scrollWidth ${m.scrollWidth} ≤ clientWidth ${m.clientWidth}`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
  const overlaps: string[] = [];
  for (let i = 0; i < m.boxes.length; i++) {
    for (let j = i + 1; j < m.boxes.length; j++) {
      const a = m.boxes[i]!;
      const b = m.boxes[j]!;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1) overlaps.push(`${a.name} × ${b.name}`);
    }
  }
  expect(overlaps, `${label}: overlapping children`).toEqual([]);
}

/** The nearest common ancestor of the given elements (fallback for a container without its own testid). */
export async function commonAncestor(page: Page, testIds: string[]): Promise<Locator> {
  const marker = 'data-e2e-common-ancestor';
  const ok = await page.evaluate(
    ({ ids, attr }) => {
      document.querySelectorAll(`[${attr}]`).forEach((n) => n.removeAttribute(attr));
      const els = ids
        .map((id) => document.querySelector(`[data-testid="${id}"]`))
        .filter((e): e is Element => !!e);
      if (els.length === 0) return false;
      let anc: Element | null = els[0]!;
      while (anc && !els.every((e) => anc!.contains(e))) anc = anc.parentElement;
      if (!anc) return false;
      anc.setAttribute(attr, '1');
      return true;
    },
    { ids: testIds, attr: marker },
  );
  expect(ok, `common ancestor of ${testIds.join(', ')}`).toBe(true);
  return page.locator(`[${marker}]`);
}

/**
 * TC-VA-11: checks the text contrast of the element and of every descendant that has its own visible text
 * (card name, tagline, "Selected" label …). Returns the number of checked text elements.
 */
export async function expectTextContrastDeep(
  loc: Locator,
  label: string,
  min?: number,
): Promise<number> {
  await expect(loc, `${label} is visible`).toBeVisible();
  const attr = 'data-e2e-text-node';
  const count = await loc.evaluate((root, a) => {
    document.querySelectorAll(`[${a}]`).forEach((n) => n.removeAttribute(a));
    let i = 0;
    const visit = (el: Element) => {
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
      );
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown =
        r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      if (ownText && shown) el.setAttribute(a, String(i++));
      for (const c of Array.from(el.children)) visit(c);
    };
    visit(root);
    return i;
  }, attr);
  expect(count, `${label}: has visible text`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const el = loc.page().locator(`[${attr}="${i}"]`);
    const text = ((await el.textContent()) ?? '').trim().slice(0, 40);
    await expectTextContrast(el, `${label} › "${text}"`, min);
  }
  return count;
}
