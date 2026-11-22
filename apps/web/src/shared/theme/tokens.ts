/**
 * Galactic Vector Terminal design tokens (SWR-009 K-1, plan §1.1; values — `design-analysis.md` §1–§2 and the UI Kit
 * prototype CSS). The ONLY place of UI Kit colour/type/size values in `apps/web`: the MUI theme (`app/theme`), the UI
 * Kit (`shared/ui/terminal`) and game styles (`games/<id>/theme`) read them, components carry no hex literals.
 * Lives in `shared` because app, shared and games all import it (ESLint B-9 allows game → shared, not the reverse).
 *
 * QD-8: `red` (#DD6B59) and `signal` (#5E8D68) are NEVER text colours (glyphs, borders, LEDs only); text uses the light
 * shades `redText` / `phosphorText` / `amberText`. Every text × background pair the theme and the UI Kit use is in
 * `textPairs` and is unit-tested ≥ 4.5:1 (`tokens.test.ts`).
 */

const color = {
  // 12 palette roles (design-analysis §1).
  /** CRT base: display background. */
  crt: '#050906',
  /** Map screen inside the display. */
  map: '#030704',
  /** Display field. */
  display: '#080F09',
  /** Input field background. */
  input: '#0C110D',
  /** Ordinary map routes (non-text). */
  route: '#456B4D',
  /** Dashed region borders (non-text). */
  region: '#66846A',
  /** Permanent signal / information (non-text: LEDs, borders). */
  signal: '#5E8D68',
  /** Available action, Rebels, active tab. */
  phosphor: '#91DFA1',
  /** Selection, focus, confirmation / warning. */
  amber: '#E3AD5C',
  /** Empire, AI events, critical (non-text). */
  red: '#DD6B59',
  /** Console case. */
  case: '#252923',
  /** Module body. */
  module: '#1D231C',
  /** Module header strip. */
  moduleHead: '#222820',
  /** Module bezel (borders 2–5 px). */
  bezel: '#41493E',
  bezelLight: '#626A5B',
  /** Secondary text, map labels. */
  warm: '#B9C2B4',
  /** Primary text. */
  paper: '#D8DDD2',
  /** Service labels (meta, uppercase). Not on keys (4.11:1 on a hovered key). */
  muted: '#9AA696',
  /** Page around the console. */
  page: '#111510',
  /** Map screen grid (non-text, used with `alpha.grid`). */
  grid: '#2D5535',
  /** Dialog surface. */
  dialog: '#242922',
  /** Inner panels (status cards, legend, alerts base). */
  panel: '#171D17',
  /** Dark plate of counters and tooltips. */
  plate: '#0B100B',
  /** Map node fill. */
  node: '#020806',
  /** Thin dividers inside modules and logs. */
  line: '#343B32',

  // Text shades (QD-8): red/signal as text are forbidden.
  redText: '#F39788',
  redTextSoft: '#F09B8C',
  phosphorText: '#A8E7B4',
  amberText: '#FFDA99',
  /** Disabled text (WCAG exempt; not part of `textPairs`). */
  disabledText: '#879185',
} as const;

export type TerminalColorRole = keyof typeof color;

export const terminalTokens = {
  color,
  /** Translucency used with colour roles (`alpha(color.grid, alpha.grid)` etc.). */
  alpha: { grid: 0.32, scanline: 0.18, backdrop: 0.78 },
  /** Hardware keys (UI Kit `.button`, design-analysis §2). */
  key: {
    default: { bg: '#30362D', border: '#6B7465', text: color.paper, bevel: '#545D4E' },
    hover: { bg: '#3A4236', border: '#A0AF99' },
    pressed: { bg: '#151A14', shadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)' },
    primary: { bg: '#24452D', border: '#77BB84', text: '#C4F2CC', hoverBg: '#2C5536' },
    selected: { bg: '#3B301E', border: color.amber, text: color.amberText },
    warning: { bg: '#44351F', border: '#B18341', text: '#FFDA9B', hoverBg: '#4F3E24' },
    danger: { bg: '#492A26', border: '#A45245', text: '#FFB5A9', hoverBg: '#55312C' },
    disabled: { bg: '#252A24', border: '#444B40', text: color.disabledText, opacity: 0.62 },
    minHeight: 42,
    /** `pointer: coarse` touch target (AC-14). */
    touchMinHeight: 44,
  },
  field: {
    border: '#687162',
    hoverBorder: '#A0AE99',
    disabledBorder: '#3B4239',
    disabledBg: '#191E18',
    height: 42,
  },
  switch: {
    track: '#252A23',
    trackBorder: '#798371',
    trackChecked: '#1C3923',
    thumb: '#A0AA9B',
    width: 38,
    height: 21,
  },
  led: {
    green: color.phosphor,
    amber: color.amber,
    red: color.red,
    offFill: '#30221E',
    offBorder: '#795348',
    size: 8,
  },
  badge: {
    green: { border: '#5B9164', text: color.phosphorText },
    amber: { border: '#A77E40', text: '#F0C77F' },
    red: { border: '#984B40', text: color.redText },
    neutral: { border: '#63705E', text: '#D1DDD0' },
  },
  alert: {
    border: '#596455',
    info: { edge: color.phosphor, bg: '#172019', icon: color.phosphor },
    warning: { edge: color.amber, bg: '#211D15', icon: color.amber },
    error: { edge: color.red, bg: '#251A18', icon: color.redText },
  },
  statusCard: { border: '#495145', bg: color.panel, text: '#ADB8AB' },
  tabs: { bg: '#1A2019', border: '#596152', text: '#ADB8AA' },
  dialog: { border: '#6B705F', shadow: '0 8px 0 #090C08', headBorder: '#52594B' },
  module: { headBorder: '#4A5347', inset: '#141813' },
  marker: { bg: color.plate, border: '#697360' },
  /** Selected manifest group (amber edge + this fill). */
  selection: { bg: '#211C13' },
  font: {
    family: '"PT Mono", ui-monospace, monospace',
    /** The CSS name of the face the app ships (`@fontsource/pt-mono`, weight 400; bold is synthesised, PA-1). */
    face: 'PT Mono',
  },
  /** Type scale [size, lineHeight, weight] in px (UI Kit §02): 28 / 19 / 14 / 22 / 11. */
  type: {
    display: { size: 28, lineHeight: 36, weight: 700 },
    title: { size: 19, lineHeight: 26, weight: 700 },
    subtitle: { size: 16, lineHeight: 22, weight: 700 },
    body: { size: 14, lineHeight: 22, weight: 400 },
    small: { size: 13, lineHeight: 20, weight: 400 },
    metric: { size: 22, lineHeight: 28, weight: 700 },
    meta: { size: 11, lineHeight: 16, weight: 400 },
    key: { size: 11, lineHeight: 13, weight: 700 },
  },
  letterSpacing: { meta: '0.1em', key: '0.03em', badge: '0.06em' },
  /** Corner radius of keys, fields, modules (circles only for LEDs and rings). */
  radius: 1,
  bezel: { module: 2, housing: 4 },
  focus: { color: color.amber, width: 2, offset: 2 },
  space: { console: 18, gap: 7, module: 12 },
} as const;

export type TerminalTokens = typeof terminalTokens;

/** One text colour on one background, both `#RRGGBB`. */
export interface TextPair {
  readonly name: string;
  readonly fg: string;
  readonly bg: string;
}

const t = terminalTokens;
const c = color;

/** Backgrounds a text may stand on (TC-TK-04). */
const SURFACES = {
  crt: c.crt,
  map: c.map,
  display: c.display,
  input: c.input,
  case: c.case,
  module: c.module,
  moduleHead: c.moduleHead,
  page: c.page,
  dialog: c.dialog,
  panel: c.panel,
  plate: c.plate,
  tabs: t.tabs.bg,
  alertInfo: t.alert.info.bg,
  alertWarning: t.alert.warning.bg,
  alertError: t.alert.error.bg,
  selection: t.selection.bg,
} as const;

/** Text colours used on the surfaces above (never `red`/`signal`/`region`/`route`/`grid`, QD-8). */
const SURFACE_TEXTS = {
  paper: c.paper,
  warm: c.warm,
  muted: c.muted,
  phosphor: c.phosphor,
  phosphorText: c.phosphorText,
  amber: c.amber,
  amberText: c.amberText,
  redText: c.redText,
  redTextSoft: c.redTextSoft,
  badgeGreen: t.badge.green.text,
  badgeAmber: t.badge.amber.text,
  badgeRed: t.badge.red.text,
  badgeNeutral: t.badge.neutral.text,
  statusCard: t.statusCard.text,
  tabs: t.tabs.text,
} as const;

function surfacePairs(): TextPair[] {
  return Object.entries(SURFACE_TEXTS).flatMap(([fgName, fg]) =>
    Object.entries(SURFACES).map(([bgName, bg]) => ({ name: `${fgName} on ${bgName}`, fg, bg })),
  );
}

/** Key texts on their own key fills (incl. hover / pressed). `muted` never stands on a key. */
function keyPairs(): TextPair[] {
  const k = t.key;
  return [
    { name: 'key text on key', fg: k.default.text, bg: k.default.bg },
    { name: 'key text on hovered key', fg: k.default.text, bg: k.hover.bg },
    { name: 'key text on pressed key', fg: k.default.text, bg: k.pressed.bg },
    { name: 'primary key text', fg: k.primary.text, bg: k.primary.bg },
    { name: 'primary key text (hover)', fg: k.primary.text, bg: k.primary.hoverBg },
    { name: 'selected key text', fg: k.selected.text, bg: k.selected.bg },
    { name: 'warning key text', fg: k.warning.text, bg: k.warning.bg },
    { name: 'warning key text (hover)', fg: k.warning.text, bg: k.warning.hoverBg },
    { name: 'danger key text', fg: k.danger.text, bg: k.danger.bg },
    { name: 'danger key text (hover)', fg: k.danger.text, bg: k.danger.hoverBg },
    { name: 'phosphor text key on key', fg: c.phosphor, bg: k.default.bg },
    { name: 'phosphor text key on hovered key', fg: c.phosphor, bg: k.hover.bg },
    { name: 'warm on key', fg: c.warm, bg: k.default.bg },
    { name: 'warm on hovered key', fg: c.warm, bg: k.hover.bg },
  ];
}

/**
 * Every «text × background» pair actually used by the theme and the UI Kit (TC-TK-04). Disabled texts are excluded
 * (WCAG 1.4.3 exception for inactive controls).
 */
export const textPairs: readonly TextPair[] = Object.freeze([...surfacePairs(), ...keyPairs()]);

/** Colours that must never be a text foreground (QD-8 and map-only roles). */
export const NON_TEXT_COLORS: readonly string[] = Object.freeze([
  c.red,
  c.signal,
  c.region,
  c.route,
  c.grid,
]);

/** Surfaces the focus ring is drawn on (≥ 3:1, WCAG 2.4.11 / 1.4.11). */
export const FOCUS_RING_SURFACES: readonly string[] = Object.freeze([
  c.page,
  c.module,
  c.case,
  c.crt,
  c.moduleHead,
  c.dialog,
  c.panel,
  t.tabs.bg,
]);
