import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type SidebarTab, useSelectionStore } from '../../board/model/selectionStore';
import { CoreContextPanel } from '../panels/CoreContextPanel';
import { TurnPanel } from '../panels/TurnPanel';
import { CoreBoardList } from './CoreBoardList';

const TABS: SidebarTab[] = ['log', 'objects', 'game'];

/**
 * Sidebar of the `core-v1` table (plan-frontend §3.4): «Turn» panel on top (D-SW5-2), the context panel, then tabs
 * Log (P2 `log` slot) · Objects (`CoreBoardList`) · Game (P2 `gameInfo` slot). Inactive tab panels stay in the DOM
 * with `hidden`, so the accessible list is always present (same as the legacy sidebar).
 */
export function CoreSidebar({ log, gameInfo }: { log?: ReactNode; gameInfo?: ReactNode }) {
  const { t } = useTranslation();
  const tab = useSelectionStore((s) => s.sidebarTab);
  const setTab = useSelectionStore((s) => s.setSidebarTab);
  return (
    <Box
      component="aside"
      aria-label={t('rebellion.board:sidebar.label')}
      data-testid="core-sidebar"
      sx={{
        display: 'grid',
        gridTemplateRows: 'minmax(0, max-content) auto minmax(0, max-content) auto minmax(0, 1fr)',
        maxHeight: { md: '100%' },
        minHeight: 0,
        height: '100%',
        borderLeft: { md: 1 },
        borderTop: { xs: 1, md: 0 },
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '& > [data-testid="turn-panel"]': { maxHeight: { md: '45dvh' } },
        '& > [data-testid="core-context-panel"]': { maxHeight: { md: '25dvh' } },
      }}
    >
      <TurnPanel />
      <Divider />
      <CoreContextPanel />
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v: SidebarTab) => setTab(v)}
          variant="fullWidth"
          aria-label={t('rebellion.board:sidebar.tabsLabel')}
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
            hidden={tab !== v}
            sx={{ p: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}
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
