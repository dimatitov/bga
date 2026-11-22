import Box, { type BoxProps } from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId, type ReactNode } from 'react';
import { terminalTokens } from '@/shared/theme';

export interface TerminalModuleProps extends Omit<BoxProps, 'title'> {
  /** Header label (meta, uppercase); it names the section (`aria-labelledby`). */
  label: ReactNode;
  /** Id of the label element (default: generated). */
  labelId?: string;
  /** Heading level of the label (default `h2`). */
  headingLevel?: 'h2' | 'h3';
  /** Header actions on the right (e.g. «Close»). */
  actions?: ReactNode;
  /** `restricted` — dashed bezel (limited visibility). */
  tone?: 'default' | 'restricted';
  /** Smaller body padding. */
  dense?: boolean;
  children?: ReactNode;
}

const T = terminalTokens;

/**
 * Console module (SWR-009 UI Kit `.module`, TC-TK-06): a `section` named by its header label, 2 px bezel with an inset
 * line, header strip and body. Extra props (`data-testid`, `sx`…) go to the section.
 */
export function TerminalModule({
  label,
  labelId,
  headingLevel = 'h2',
  actions,
  tone = 'default',
  dense = false,
  children,
  sx,
  ...rest
}: TerminalModuleProps) {
  const generated = useId();
  const id = labelId ?? `terminal-module-${generated}`;
  return (
    <Box
      component="section"
      aria-labelledby={id}
      data-tone={tone}
      {...rest}
      sx={[
        {
          border: `${T.bezel.module}px ${tone === 'restricted' ? 'dashed' : 'solid'} ${T.color.bezel}`,
          backgroundColor: T.color.module,
          boxShadow: `inset 0 0 0 1px ${T.module.inset}`,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: dense ? '6px 10px' : '10px 12px',
          borderBottom: `1px solid ${T.module.headBorder}`,
          backgroundColor: T.color.moduleHead,
          flex: 'none',
        }}
      >
        <Typography id={id} component={headingLevel} variant="meta" sx={{ m: 0 }}>
          {label}
        </Typography>
        {actions}
      </Box>
      <Box sx={{ padding: dense ? '8px 10px' : `${T.space.module}px`, minHeight: 0, flex: 1 }}>
        {children}
      </Box>
    </Box>
  );
}
