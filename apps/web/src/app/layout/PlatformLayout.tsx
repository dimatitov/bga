import Box from '@mui/material/Box';
import { Outlet } from 'react-router';
import { AppHeader } from './AppHeader';
import { MainRegion } from './MainRegion';

/** Catalogue, game page, new session, settings, 404: platform header + main (D-HDR-1). */
export function PlatformLayout() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <MainRegion>
        <Outlet />
      </MainRegion>
    </Box>
  );
}
