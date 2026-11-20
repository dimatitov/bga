import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useDevAiTableDiagnostics } from '../session/diagnosticsFlag';
import { Section } from './Section';

/**
 * Opt-in switch of the AI decision panel on the game table (SWR-008 plan-frontend §2.1 G-2, QD-15): off by default,
 * stored in this browser only (`bga.dev.aiTableDiagnostics.v1`).
 */
export function TableDiagnosticsCard() {
  const { t } = useTranslation('devAi');
  const enabled = useDevAiTableDiagnostics((s) => s.enabled);
  const setEnabled = useDevAiTableDiagnostics((s) => s.setEnabled);
  const hintId = useId();
  return (
    <Section title={t('tableDiagnostics.title')} testId="dev-ai-table-diagnostics">
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            slotProps={{
              input: {
                'aria-describedby': hintId,
                // testid on the input itself so `toBeChecked()` works (as `settings-reduce-motion`).
                ...({ 'data-testid': 'dev-ai-table-diagnostics-switch' } as object),
              },
            }}
          />
        }
        label={t('tableDiagnostics.label')}
      />
      <Typography id={hintId} variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('tableDiagnostics.hint')}
      </Typography>
    </Section>
  );
}
