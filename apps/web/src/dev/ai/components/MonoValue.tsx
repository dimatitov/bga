import Box from '@mui/material/Box';
import { monoSx } from './mono';

/**
 * A data value in monospace, or — when there is no value — a localized placeholder word («не задана», «без цели»)
 * rendered in the regular UI font (D-3): placeholders are prose, not data.
 */
export function MonoValue({
  value,
  placeholder,
}: {
  value: string | null | undefined;
  placeholder: string;
}) {
  if (value === null || value === undefined || value === '') {
    return (
      <Box
        component="span"
        data-placeholder="true"
        sx={{ fontStyle: 'italic', color: 'text.secondary' }}
      >
        {placeholder}
      </Box>
    );
  }
  return (
    <Box component="code" sx={monoSx}>
      {value}
    </Box>
  );
}
