import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import type { TableScreenProps } from '@/games/types';
import { CoreTable } from '../core-v1/CoreTable';
import { HandoffScreen } from './components/HandoffScreen';
import { LegacyTable } from './LegacyTable';
import { useRebellionView } from './hooks/useRebellionView';

/** The stored view does not match the Rebellion schema (plan-frontend §3.3): message + "← To game". */
function InvalidView({ backHref }: { backHref: string }) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="table-invalid-view"
      sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh', p: 4 }}
    >
      <Box sx={{ maxWidth: 560, display: 'grid', gap: 2, justifyItems: 'center' }}>
        <Typography component="h1" variant="h5" sx={{ textAlign: 'center' }}>
          {t('rebellion.session:invalidView.title')}
        </Typography>
        <Alert severity="error" sx={{ width: '100%' }}>
          {t('rebellion.session:invalidView.text')}
        </Alert>
        <Button
          component={RouterLink}
          to={backHref}
          variant="contained"
          startIcon={<ArrowBackIcon />}
          data-testid="session-back-to-game"
        >
          {t('rebellion.session:topBar.backToGame')}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Rebellion game table (SWR-002 table, SWR-003 plan-frontend §2.1, §3.3, M2) — a dispatcher since SWR-005 FE-0
 * (plan-frontend §3.1): handoff view → `HandoffScreen` (unchanged), `rulesEngine: 'mock-v1'` → `LegacyTable`
 * (old sessions), `rulesEngine: 'core-v1'` → `CoreTable`. Rendered by the platform's
 * SessionHost (`/sessions/:sessionId`), which owns loading, 404 and "game unavailable"; this screen gets the
 * session's `view: unknown` in props (re-rendered on every `setQueryData`/refetch of `sessionKeys.detail`) and
 * parses it with the Rebellion schema. `game-table[data-game-id]` is the game id, `data-session-id` the session (Q-10).
 */
export default function TableScreen({
  sessionId,
  gameId,
  status,
  view,
  backHref,
}: TableScreenProps) {
  const parsed = useRebellionView(view);
  const kind = 'error' in parsed ? null : parsed.view.kind;
  // Whether this screen has shown the handoff screen: the next table is a hot-seat switch (focus its heading).
  const [sawHandoff, setSawHandoff] = useState(false);
  if (kind === 'handoff' && !sawHandoff) setSawHandoff(true);

  if ('error' in parsed) return <InvalidView backHref={backHref} />;
  if (parsed.view.kind === 'handoff') {
    return (
      <HandoffScreen key="handoff" sessionId={sessionId} view={parsed.view} backHref={backHref} />
    );
  }
  // A different viewer (hot-seat) remounts the whole table: fresh stores, map fitted again. The engine is part
  // of the key too: a mock table never turns into a core table in place.
  if (parsed.view.rulesEngine === 'core-v1') {
    return (
      <CoreTable
        key={`core-${parsed.view.viewer}`}
        sessionId={sessionId}
        gameId={gameId}
        status={status}
        view={parsed.view}
        backHref={backHref}
        focusHeading={sawHandoff}
      />
    );
  }
  return (
    <LegacyTable
      key={`mock-${parsed.view.viewer}`}
      sessionId={sessionId}
      gameId={gameId}
      status={status}
      view={parsed.view}
      backHref={backHref}
      focusHeading={sawHandoff}
    />
  );
}
