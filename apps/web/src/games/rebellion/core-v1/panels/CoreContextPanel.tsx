import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { TerminalModule } from '@/shared/ui';
import { useSelectionStore } from '../../board/model/selectionStore';
import { ForceGlyph } from '../../ui/ForceGlyph';
import { InspectorHeading } from '../manifest/InspectorHeading';
import { arenaOf } from '../model/forces';
import { useCoreBoard } from '../model/coreContext';
import { shownAt, unitById } from '../model/viewModel';
import { CoreSystemPanel } from './CoreSystemPanel';
import { HiddenZonePanel } from './HiddenZonePanel';
import { LeaderPanel } from './LeaderPanel';
import { factionLabel, systemLabel, unitLabel } from './labels';

const TITLE_ID = 'core-context-title';
const T = terminalTokens;

/**
 * Context of the current selection (plan-frontend §3.4, §7) in the console inspector module (SWR-009 MF): system /
 * leader / unit / hidden zone / hint.
 */
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
        <Box data-testid="unit-panel" data-unit-id={unit.id} sx={{ display: 'grid', gap: '6px' }}>
          <InspectorHeading name={unitLabel(t, view, unit.id)} />
          <Typography
            variant="body2"
            sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.color.paper }}
          >
            <ForceGlyph owner={unit.owner} kind={arenaOf(view, unit.typeKey)} />
            {t('rebellion.turn:context.side', { side: factionLabel(t, unit.owner) })}
          </Typography>
          <Typography variant="body2" sx={{ color: T.color.paper }}>
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
    <TerminalModule
      label={t('rebellion.turn:context.label')}
      labelId={TITLE_ID}
      data-testid="core-context-panel"
      dense
      sx={{ overflowY: 'auto', minHeight: 0 }}
    >
      {body ?? (
        <Typography variant="body2" sx={{ color: T.color.warm }}>
          {t('rebellion.turn:context.empty')}
        </Typography>
      )}
    </TerminalModule>
  );
}
