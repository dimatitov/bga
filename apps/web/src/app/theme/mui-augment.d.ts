import '@mui/material/styles';

/** Custom palette entries (plan-frontend §8, names frozen). */
declare module '@mui/material/styles' {
  interface Palette {
    mock: { main: string };
    focus: string;
  }
  interface PaletteOptions {
    mock?: { main: string };
    focus?: string;
  }
}
