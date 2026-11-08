import Box from '@mui/material/Box';
import type { GameStatus } from '@bga/platform';

/** 16:9 cover `<img>`; coming_soon covers are muted (D-CAT-5). */
export function GameCover(props: {
  src: string;
  alt: string;
  status: GameStatus;
  'data-testid': string;
  maxWidth?: number;
}) {
  return (
    <Box
      component="img"
      src={props.src}
      alt={props.alt}
      data-testid={props['data-testid']}
      sx={{
        display: 'block',
        width: '100%',
        maxWidth: props.maxWidth,
        aspectRatio: '16 / 9',
        objectFit: 'cover',
        ...(props.status === 'available' ? {} : { opacity: 0.6, filter: 'grayscale(0.5)' }),
      }}
    />
  );
}
