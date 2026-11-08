import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useCoreBoard } from '../model/coreContext';
import { shownAt, unitById } from '../model/viewModel';
import { CoreSystemPanel } from './CoreSystemPanel';
import { HiddenZonePanel } from './HiddenZonePanel';
import { LeaderPanel } from './LeaderPanel';
import { factionLabel, systemLabel, unitLabel } from './labels';

const TITLE_ID = 'core-context-title';

/** Context of the current selection (plan-frontend §3.4, §7): system / leader / unit / hidden zone / hint. */
export function CoreContextPanel() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const selection = useSelectionStore((s) => s.selection);

  let body;
  switch (selection.kind) {
    case 'system':
      body = <CoreSystemPanel systemId={selection.systemId} />;
      break;
    case 'leader':
      body = <LeaderPanel leaderId={selection.leaderId} />;
      break;
    case 'zone':
      body = <HiddenZonePanel />;
      break;
    case 'piece': {
      const unit = unitById(view, selection.pieceId);
      const at = unit ? shownAt(unit.location) : null;
      body = unit ? (
        <Box data-testid="unit-panel" data-unit-id={unit.id} sx={{ display: 'grid', gap: 0.5 }}>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {unitLabel(t, view, unit.id)}
          </Typography>
          <Typography variant="body2">
            {t('rebellion.turn:context.side', { side: factionLabel(t, unit.owner) })}
          </Typography>
          <Typography variant="body2">
            {t('rebellion.turn:context.unitIn', {
              place: at === null ? t('rebellion.turn:context.inZone') : systemLabel(t, view, at),
            })}
          </Typography>
        </Box>
      ) : null;
      break;
    }
    case 'none':
      body = null;
  }

  return (
    <Box
      component="section"
      aria-labelledby={TITLE_ID}
      data-testid="core-context-panel"
      sx={{ p: 2, display: 'grid', gap: 1, overflowY: 'auto', minHeight: 0 }}
    >
      <Typography
        id={TITLE_ID}
        variant="overline"
        component="h2"
        sx={{ color: 'text.secondary', lineHeight: 1.5 }}
      >
        {t('rebellion.turn:context.label')}
      </Typography>
      {body ?? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.turn:context.empty')}
        </Typography>
      )}
    </Box>
  );
}
