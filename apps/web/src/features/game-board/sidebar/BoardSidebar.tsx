import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextPanel } from '../panels/ContextPanel';
import { type SidebarTab, useSelectionStore } from '../model/selectionStore';
import { BoardList } from './BoardList';
import { EventLog } from './EventLog';

const TABS: SidebarTab[] = ['log', 'objects', 'game'];

/**
 * Right sidebar: context panel on top, tabs below (Log · Objects · Game). Inactive tab panels stay in the DOM with
 * `hidden`, so the accessible list is always present (R-9).
 */
export function BoardSidebar({ gameInfo }: { gameInfo: ReactNode }) {
  const { t } = useTranslation();
  const tab = useSelectionStore((s) => s.sidebarTab);
  const setTab = useSelectionStore((s) => s.setSidebarTab);
  return (
    <Box
      component="aside"
      aria-label={t('board:sidebar.label')}
      sx={{
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        minHeight: 0,
        height: '100%',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <ContextPanel />
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v: SidebarTab) => setTab(v)}
          variant="fullWidth"
          aria-label={t('board:sidebar.tabsLabel')}
        >
          {TABS.map((v) => (
            <Tab
              key={v}
              value={v}
              label={t(`board:sidebar.tab.${v}`)}
              id={`sidebar-tab-${v}`}
              aria-controls={`sidebar-panel-${v}`}
              data-testid={`sidebar-tab-${v}`}
              // Every tab is a Tab stop (not only the selected one) so keyboard users reach "Objects" with Tab alone.
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
            {v === 'log' && <EventLog />}
            {v === 'objects' && <BoardList />}
            {v === 'game' && gameInfo}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
