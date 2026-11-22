import ButtonBase, { type ButtonBaseProps } from '@mui/material/ButtonBase';
import { terminalTokens } from '@/shared/theme';
import { UnitGlyph, type UnitGlyphProps } from './UnitGlyph';

export interface CounterMarkerProps extends Omit<
  ButtonBaseProps,
  'children' | 'aria-label' | 'aria-pressed'
> {
  glyph: Omit<UnitGlyphProps, 'size'>;
  /** Number of figures in the group: a positive integer; 0 → nothing is rendered. */
  count: number;
  /** Toggle state (`aria-pressed`): the group is selected / its manifest is open. */
  pressed?: boolean;
  /** Mandatory accessible name (the glyph and the number alone say nothing to a screen reader). */
  'aria-label': string;
}

const T = terminalTokens;

/**
 * DOM group marker «glyph + count» (SWR-009 UI Kit `.counter-marker`, TC-TK-10/11): a focusable button with a border
 * in the glyph colour; pressed → amber 2px; ≥ 44×44 on touch. `data-count` mirrors the number.
 * A negative or fractional `count` is a programming error (throws) — never «-1» on screen.
 */
export function CounterMarker({ glyph, count, pressed, sx, ...rest }: CounterMarkerProps) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`CounterMarker: count must be a non-negative integer, got ${count}`);
  }
  if (count === 0) return null;
  return (
    <ButtonBase
      data-count={count}
      aria-pressed={pressed === undefined ? undefined : pressed}
      {...rest}
      sx={[
        {
          minWidth: 64,
          minHeight: 34,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '9px',
          padding: '7px 9px',
          border: `1px solid ${glyph.stroke ?? glyph.color}`,
          backgroundColor: T.marker.bg,
          color: T.color.paper,
          fontFamily: T.font.family,
          fontSize: 13,
          fontWeight: 700,
          borderRadius: `${T.radius}px`,
          '&:hover': { backgroundColor: T.key.default.bg },
          '&[aria-pressed="true"]': {
            border: `2px solid ${T.key.selected.border}`,
            backgroundColor: T.key.selected.bg,
            color: T.key.selected.text,
          },
          '@media (pointer: coarse)': { minWidth: 44, minHeight: 44 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <UnitGlyph {...glyph} size={14} />
      <span>{count}</span>
    </ButtonBase>
  );
}
