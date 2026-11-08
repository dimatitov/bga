import '@mui/material/styles';
import { type BoardPalette, type FactionPalette } from './tokens';

/** Custom palette entries (plan-frontend §8, names frozen). */
declare module '@mui/material/styles' {
  interface Palette {
    faction: FactionPalette;
    board: BoardPalette;
    mock: { main: string };
    focus: string;
  }
  interface PaletteOptions {
    faction?: FactionPalette;
    board?: BoardPalette;
    mock?: { main: string };
    focus?: string;
  }
}
