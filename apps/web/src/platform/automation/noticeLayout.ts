import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Placement of `AutomationNotice` (SWR-006 QA defect D-1).
 *
 * The former `position: fixed; left: 50%; transform: translateX(-50%)` made the browser size the alert to the space
 * between `left: 50%` and the right edge (≈ half the viewport), so at 375 px it shrank to ~190 px and, centred at the
 * bottom, covered the game's controls (map zoom, start of the turn panel; at 1440 — the zoom «fit» button).
 *
 * - `xs`–`sm` (the page scrolls there): in normal flow at the top of the session page, full width minus 2×16 px —
 *   it pushes the table down instead of covering it.
 * - `md`+ (tables usually fill the viewport): fixed in the bottom-left corner, at most `min(560px, 50% − 32px)` wide,
 *   so it stays clear of controls docked in the bottom-right of the play area (map zoom). Raised above the refetch
 *   warning when both are shown (`stacked`).
 */
export function automationNoticeSx(stacked: boolean): SxProps<Theme> {
  return {
    position: { xs: 'static', md: 'fixed' },
    m: { xs: 2, md: 0 },
    left: { md: 16 },
    bottom: { md: stacked ? 72 : 16 },
    width: { md: 'max-content' },
    maxWidth: { xs: 'none', md: 'min(560px, calc(50% - 32px))' },
    zIndex: (theme) => theme.zIndex.snackbar,
  };
}
