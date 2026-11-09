import Box from '@mui/material/Box';
import { type AIUsage } from '@bga/platform';
import { useTranslation } from 'react-i18next';
import { formatTokens } from '../format';

const ROWS = [
  ['input', 'inputTokens'],
  ['cached', 'cachedInputTokens'],
  ['output', 'outputTokens'],
  ['reasoning', 'reasoningTokens'],
  ['total', 'totalTokens'],
] as const satisfies readonly (readonly [string, keyof AIUsage])[];

/**
 * Token usage as a two-column table with row headers: narrow enough for 375 px without horizontal scroll, so one
 * structure serves all widths (plan-frontend §8 allowed a `<dl>` on xs; a vertical table needs no second markup).
 */
export function TokenTable({ usage, caption }: { usage: AIUsage; caption: string }) {
  const { t, i18n } = useTranslation('devAi');
  const lng = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Box
      component="table"
      sx={{
        borderCollapse: 'collapse',
        '& th, & td': { py: 0.25, pr: 2, textAlign: 'left', verticalAlign: 'top' },
        '& th': { fontWeight: 400, color: 'text.secondary' },
        '& td': { fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
      }}
    >
      <Box component="caption" sx={{ textAlign: 'left', fontWeight: 600, pb: 0.5 }}>
        {caption}
      </Box>
      <tbody>
        {ROWS.map(([key, field]) => {
          const value = usage[field];
          const text = formatTokens(value, lng);
          return (
            <tr key={key}>
              <th scope="row">{t(`result.tokens.${key}`)}</th>
              <td
                data-testid={`dev-ai-tokens-${key}`}
                data-value={value === null ? '' : String(value)}
              >
                {text ?? (
                  <>
                    <span aria-hidden>—</span>
                    <Box component="span" sx={{ ml: 1, fontWeight: 400, color: 'text.secondary' }}>
                      {t('result.tokens.noData')}
                    </Box>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}
