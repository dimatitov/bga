import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CONSOLE_SPLIT, mq, terminalTokens } from '@/shared/theme';
import { type SidebarTab, useSelectionStore } from '../../board/model/selectionStore';
import { requestMatchesSelection } from '../manifest/manifestModel';
import { UnitInspector } from '../manifest/UnitInspector';
import { useCoreUiStore } from '../model/coreUiStore';
import { TurnControls } from '../panels/TurnControls';
import { TurnPanel } from '../panels/TurnPanel';
import { CoreBoardList } from './CoreBoardList';

const TABS: SidebarTab[] = ['log', 'objects', 'game'];

const T = terminalTokens;
const SPLIT_UP = mq.up(CONSOLE_SPLIT);
const SPLIT_DOWN = mq.down(CONSOLE_SPLIT);
/** Below 900 px: the log height of the design and the cap of the other tab panels. */
const TAB_LOG_MAX = 220;
const TAB_PANEL_MAX = 'min(60vh, 480px)';
const BEZEL = `${T.bezel.module}px solid ${T.color.bezel}`;

/**
 * Rail of the `core-v1` game console (SWR-009 C2, K-7; SWR-005 plan-frontend §3.4): «Your task» module
 * (`TurnPanel`) → the turn keys (`TurnControls`) → the inspector (`UnitInspector` → context panel / Unit Manifest) →
 * tabs Log (P2 `log` slot) · Objects (`CoreBoardList`) · Game (P2 `gameInfo` slot). Inactive tab panels stay in the
 * DOM with `hidden`, so the accessible list is always present (same as the legacy sidebar).
 * ≥ 900 px the rail fills its grid cell and every module scrolls inside (turn ≤ 42 %, inspector ≤ 32 % of the
 * viewport); below 900 px it flows with the page, the key row is sticky at the bottom, the log is ≤ 220 px and the other
 * tab panels ≤ min(60vh, 480px) (each scrolls inside).
 * While the Unit Manifest is open in the rail (`data-manifest-open`, same rule as `UnitInspector`: the request matches
 * the selection and no leader is armed) the inspector row grows (design `.rail.manifest-open`): the turn module is
 * capped at 252 px (header, task, status, LED line and two rows of the leader pool; the rest scrolls inside), the
 * manifest takes all the remaining height and scrolls inside (≥ 150 px), the tabs keep a minimal strip (≥ 84 px).
 */
export function CoreSidebar({ log, gameInfo }: { log?: ReactNode; gameInfo?: ReactNode }) {
  const { t } = useTranslation();
  const tab = useSelectionStore((s) => s.sidebarTab);
  const setTab = useSelectionStore((s) => s.setSidebarTab);
  const selection = useSelectionStore((s) => s.selection);
  const manifest = useCoreUiStore((s) => s.manifest);
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const manifestOpen = armed === null && requestMatchesSelection(manifest, selection);
  return (
    <Box
      component="aside"
      aria-label={t('rebellion.board:sidebar.label')}
      data-testid="core-sidebar"
      data-manifest-open={manifestOpen ? 'true' : 'false'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${T.space.gap}px`,
        minWidth: 0,
        minHeight: 0,
        [SPLIT_UP]: {
          // A flex column, not a grid: the turn module keeps its content height (≤ 42dvh, task + status + LED line +
          // the whole leader pool), the inspector gives way first (it scrolls inside), the tabs take the rest (≥ 132 px).
          // (`&:empty` of the inspector wrapper still hides it — `display: none` beats the min height.)
          height: '100%',
          maxHeight: '100%',
          // On a short rail (e.g. 1024×768) the inspector gives way first (shrink 10 × its height vs 1 × the turn
          // module's), the turn module only after it and never below 160 px; nothing overflows the rail. (Shrink
          // factors stay ≥ 1: a sum < 1 would make flexbox absorb only part of the overflow.)
          '& > [data-testid="turn-panel"]': {
            flex: '0 1 auto',
            minHeight: 160,
            maxHeight: '42dvh',
          },
          '& > [data-rail-keys]': { flex: 'none' },
          '& > [data-rail-inspector]': {
            flex: '0 10 auto',
            minHeight: 48,
            maxHeight: '32dvh',
            overflowY: 'auto',
          },
          '& > [data-rail-tabs]': { flex: '1 1 0', minHeight: 132 },
          // Manifest open (design `.rail.manifest-open`): turn ≤ 252 px (task lines + two pool rows; the rest scrolls),
          // the manifest takes the larger share (≥ 150 px, scrolls in its body), the tabs keep a strip (≥ 84 px).
          '&[data-manifest-open="true"]': {
            '& > [data-testid="turn-panel"]': { maxHeight: 252 },
            '& > [data-rail-inspector]': {
              flex: '1 1 0',
              minHeight: 150,
              maxHeight: 'none',
              overflowY: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              '& > [data-testid="unit-manifest"]': { flex: 1, minHeight: 0, maxHeight: '100%' },
            },
            '& > [data-rail-tabs]': { flex: '0.3 1 0', minHeight: 84 },
          },
        },
      }}
    >
      <TurnPanel />
      <Box
        data-rail-keys=""
        sx={{
          p: '7px',
          border: BEZEL,
          backgroundColor: T.color.moduleHead,
          '&:empty': { display: 'none' },
          [SPLIT_DOWN]: {
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            boxShadow: `0 -4px 0 ${T.color.case}`,
          },
        }}
      >
        <TurnControls />
      </Box>
      <Box
        data-rail-inspector=""
        sx={{
          minHeight: 0,
          '&:empty': { display: 'none' },
          // The manifest scrolls inside (its body), never the whole rail.
          '& > [data-testid="unit-manifest"]': { maxHeight: '60vh' },
        }}
      >
        <UnitInspector />
      </Box>
      <Box
        data-rail-tabs=""
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          border: BEZEL,
          backgroundColor: T.color.module,
          boxShadow: `inset 0 0 0 1px ${T.module.inset}`,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v: SidebarTab) => setTab(v)}
          variant="fullWidth"
          aria-label={t('rebellion.board:sidebar.tabsLabel')}
          sx={{ flex: 'none' }}
        >
          {TABS.map((v) => (
            <Tab
              key={v}
              value={v}
              label={t(`rebellion.board:sidebar.tab.${v}`)}
              id={`sidebar-tab-${v}`}
              aria-controls={`sidebar-panel-${v}`}
              data-testid={`sidebar-tab-${v}`}
              tabIndex={0}
            />
          ))}
        </Tabs>
        {TABS.map((v) => (
          <Box
            key={v}
            role="tabpanel"
            id={`sidebar-panel-${v}`}
            aria-labelledby={`sidebar-tab-${v}`}
            data-tab={v}
            hidden={tab !== v}
            sx={{
              px: 1.25,
              py: 1,
              overflowY: 'auto',
              flex: 1,
              minHeight: 0,
              // < 900 px the rail flows with the page: every tab panel scrolls inside instead of stretching the
              // page (the Objects list alone is ~4,600 px); the log keeps the design's 220 px.
              [SPLIT_DOWN]: { maxHeight: v === 'log' ? TAB_LOG_MAX : TAB_PANEL_MAX },
            }}
          >
            {v === 'log' && log}
            {v === 'objects' && <CoreBoardList />}
            {v === 'game' && gameInfo}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
