import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import type { ManifestRequest } from '../model/coreUiStore';
import { UnitManifest } from './UnitManifest';

const T = terminalTokens;

/** Heights of the sheet (design-analysis §4): collapsed = the toggle strip, open = `min(70vh, 620px)`. */
export const SHEET_COLLAPSED_PX = 56;
export const SHEET_OPEN_HEIGHT = 'min(70vh, 620px)';

/**
 * Mobile bottom sheet of the Unit Manifest (SWR-009 MF, AC-13: < 760 px): fixed to the bottom of the viewport, mounted
 * only while a manifest is open; a 48 px toggle (`aria-expanded`) collapses it to 56 px; Esc inside closes the
 * manifest. Not modal: no focus trap, the page under it stays usable.
 */
export function ManifestSheet({ request, onClose }: { request: ManifestRequest; onClose(): void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <Box
      data-testid="unit-manifest-sheet"
      data-open={open ? 'true' : 'false'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        height: open ? SHEET_OPEN_HEIGHT : `${SHEET_COLLAPSED_PX}px`,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: T.color.module,
        borderTop: `${T.bezel.module}px solid ${T.color.bezel}`,
        boxShadow: `0 -8px 24px ${T.color.page}`,
        transition: 'height 0.18s ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        '[data-reduced-motion="true"] &': { transition: 'none' },
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <UnitManifest
          request={request}
          variant="sheet"
          onClose={onClose}
          collapsed={!open}
          headerExtra={
            <ButtonBase
              data-testid="unit-manifest-sheet-toggle"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              sx={{
                flex: 'none',
                width: '100%',
                height: 48,
                gap: '8px',
                borderBottom: `1px solid ${T.module.headBorder}`,
                backgroundColor: T.color.moduleHead,
                color: T.color.phosphor,
                fontFamily: T.font.family,
                fontSize: T.type.key.size,
                letterSpacing: T.letterSpacing.meta,
                textTransform: 'uppercase',
                '&:focus-visible': {
                  outline: `${T.focus.width}px solid ${T.focus.color}`,
                  outlineOffset: -T.focus.width,
                },
              }}
            >
              <span aria-hidden="true">{open ? '▾' : '▴'}</span>
              {t(open ? 'rebellion.manifest:sheet.collapse' : 'rebellion.manifest:sheet.expand')}
            </ButtonBase>
          }
        />
      </Box>
    </Box>
  );
}
