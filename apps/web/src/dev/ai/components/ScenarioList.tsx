import CheckIcon from '@mui/icons-material/Check';
import ScienceIcon from '@mui/icons-material/Science';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { type DevAiScenario } from '../api';
import { monoSx } from './mono';
import { MonoValue } from './MonoValue';
import { Section } from './Section';

/** The test scenario as data (monospace, untranslated, D-FE-4), marked «test data, not Rebellion rules» (A-1). */
export function ScenarioList({
  scenario,
  selectedId,
  area,
}: {
  scenario: DevAiScenario;
  selectedId: string | null;
  area?: string;
}) {
  const { t } = useTranslation('devAi');
  return (
    <Section title={t('scenario.title')} testId="dev-ai-scenario" area={area}>
      <Stack spacing={1.5}>
        <Chip
          icon={<ScienceIcon aria-hidden />}
          label={t('scenario.note')}
          color="warning"
          variant="outlined"
          data-testid="dev-ai-scenario-note"
          sx={{ alignSelf: 'flex-start', maxWidth: '100%' }}
        />
        <Box
          component="dl"
          sx={{
            m: 0,
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            columnGap: 1.5,
            rowGap: 0.5,
          }}
        >
          <Box component="dt" sx={{ color: 'text.secondary' }}>
            {t('scenario.faction')}
          </Box>
          <Box component="dd" sx={{ m: 0, ...monoSx }}>
            {scenario.faction}
          </Box>
          <Box component="dt" sx={{ color: 'text.secondary' }}>
            {t('scenario.phase')}
          </Box>
          <Box component="dd" sx={{ m: 0, ...monoSx }}>
            {scenario.phase}
          </Box>
          <Box component="dt" sx={{ color: 'text.secondary' }}>
            {t('scenario.objective')}
          </Box>
          <Box component="dd" sx={{ m: 0, ...monoSx }}>
            {scenario.objective}
          </Box>
        </Box>
        <Typography variant="subtitle2" component="h3">
          {t('scenario.actions')}
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.75 }}>
          {scenario.availableActions.map((action) => {
            const selected = action.id === selectedId;
            return (
              <Box
                component="li"
                key={action.id}
                data-testid={`dev-ai-action-${action.id}`}
                data-selected={String(selected)}
                aria-current={selected ? 'true' : undefined}
                sx={{ fontWeight: selected ? 700 : 400 }}
              >
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', flexWrap: 'wrap', columnGap: 1.5 }}
                >
                  <Box component="code" sx={monoSx}>
                    {action.id}
                  </Box>
                  <Box component="code" sx={monoSx}>
                    {action.type}
                  </Box>
                  <MonoValue value={action.target} placeholder={t('scenario.noTarget')} />
                  {selected ? (
                    <Box
                      component="span"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <CheckIcon fontSize="small" color="success" aria-hidden />
                      {t('scenario.selected')}
                    </Box>
                  ) : null}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Stack>
    </Section>
  );
}
