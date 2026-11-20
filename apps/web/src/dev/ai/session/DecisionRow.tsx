import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { type AiDecisionDiagnostic } from '@bga/platform';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { automationFallbackReasonText } from '@/platform';
import { MonoValue } from '../components/MonoValue';
import { monoSx } from '../components/mono';
import {
  decisionDataAttrs,
  fallbackCode,
  formatInt,
  formatMicroUsd,
  formatTime,
  ruleIdsText,
} from './model';

function Line({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}
    >
      {children}
    </Box>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {children}
    </Box>
  );
}

/**
 * One model call of the session (plan-frontend §2.4): rules on/off, count, ids, context tokens, truncated / dropped by
 * the prompt limit, rules version, fallback code, call tokens, cost and duration. Wire fields only.
 */
export function DecisionRow({
  index,
  decision,
}: {
  index: number;
  decision: AiDecisionDiagnostic;
}) {
  const { t, i18n } = useTranslation('devAi');
  const lng = i18n.resolvedLanguage ?? i18n.language;
  const none = t('session.none');
  const { rules } = decision;
  const code = fallbackCode(decision);
  const num = (v: number) => formatInt(v, lng) ?? none;
  return (
    <Box
      component="li"
      data-testid={`dev-ai-session-decision-${index}`}
      {...decisionDataAttrs(decision)}
      sx={{
        listStyle: 'none',
        py: 1,
        borderTop: 1,
        borderColor: 'divider',
        display: 'grid',
        gap: 0.5,
        typography: 'body2',
        minWidth: 0,
      }}
    >
      <Line>
        <Box component="span" sx={{ fontWeight: 600 }}>
          {formatTime(decision.at, lng) ?? none}
        </Box>
        <Box component="span" sx={monoSx}>
          {decision.provider}
        </Box>
        <Box component="span" sx={monoSx}>
          {decision.model}
        </Box>
        <Label>{t('session.attempts', { count: decision.attempts })}</Label>
      </Line>
      <Line>
        <Chip
          size="small"
          variant="outlined"
          color={rules.enabled ? 'primary' : 'default'}
          label={rules.enabled ? t('session.rules.on') : t('session.rules.off')}
        />
        <span>{t('session.rules.count', { count: rules.count })}</span>
        <span title={t('session.rules.chars', { chars: num(rules.chars) })}>
          {t('session.rules.tokens', { tokens: num(rules.tokensEstimate) })}
        </span>
        {rules.truncated ? (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={t('session.rules.truncated')}
          />
        ) : null}
        {rules.dropped ? (
          <Chip size="small" color="warning" label={t('session.rules.dropped')} />
        ) : null}
      </Line>
      <Line>
        <Label>{t('session.rules.ids')}:</Label>
        <MonoValue value={ruleIdsText(rules.ids)} placeholder={none} />
      </Line>
      <Line>
        <Label>{t('session.rules.version')}:</Label>
        <MonoValue value={rules.rulesVersion} placeholder={none} />
      </Line>
      <Line>
        {code === null ? (
          <span>{t('session.fallback.none')}</span>
        ) : (
          <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 1 }}>
            <Box component="span" sx={{ ...monoSx, fontWeight: 600 }}>
              {t('session.fallback.code', { code })}
            </Box>
            <Label>{automationFallbackReasonText(t, code)}</Label>
          </Stack>
        )}
      </Line>
      <Line>
        <span>
          {t('session.tokens', {
            input: num(decision.inputTokens),
            cached: num(decision.cachedInputTokens),
            output: num(decision.outputTokens),
          })}
        </span>
      </Line>
      <Line>
        <span>
          {t('session.cost', { cost: formatMicroUsd(decision.costMicroUsd, lng) ?? none })}
        </span>
        <Label>{t('session.duration', { value: num(decision.durationMs) })}</Label>
      </Line>
    </Box>
  );
}
