import Box from '@mui/material/Box';
import { Outlet } from 'react-router';
import { MainRegion } from './MainRegion';

/** Full-screen table: only `<main>`, no platform header (D-HDR-2). */
export function SessionLayout() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <MainRegion>
        <Outlet />
      </MainRegion>
    </Box>
  );
}
