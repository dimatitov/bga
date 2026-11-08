import BoltIcon from '@mui/icons-material/Bolt';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { activationTargets, systemById } from '../model/viewModel';
import { regionLabel, systemLabel } from './labels';
import { useTurnErrorStore } from './turnErrorStore';
import { useTurnCommands } from './useTurnCommands';

interface Option {
  id: string;
  label: string;
  region: string;
  regionOrder: number;
}

/**
 * Keyboard path of the activation (plan-frontend §5.3 step 2): MUI `Autocomplete` over the armed leader's
 * `ACTIVATE_SYSTEM.systemIds` (grouped by region, filtered by the localized name), then the explicit
 * «Activate <system>» button. Enter inside the field only picks an option — it never sends the command.
 * A 422 reason is shown inline by the turn panel (`activation-error`, `role="alert"`).
 */
export function ActivationPicker({ leaderId }: { leaderId: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { activate, isPending } = useTurnCommands();
  const [value, setValue] = useState<Option | null>(null);
  const setError = useTurnErrorStore((s) => s.setActivation);

  const options = useMemo<Option[]>(() => {
    const regionIndex = new Map(view.map.regions.map((r, i) => [r.id, i]));
    return activationTargets(view, leaderId)
      .map((id) => {
        const regionId = systemById(view, id)?.regionId ?? '';
        return {
          id,
          label: systemLabel(t, view, id),
          region: regionId ? regionLabel(t, view, regionId) : '',
          regionOrder: regionIndex.get(regionId) ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.regionOrder - b.regionOrder || a.label.localeCompare(b.label));
  }, [view, leaderId, t]);

  // The picked option disappears when the server no longer lists it.
  const selected = value && options.some((o) => o.id === value.id) ? value : null;

  const submit = async () => {
    if (!selected) return;
    setError(null);
    await activate(leaderId, selected.id);
  };

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Autocomplete
        options={options}
        value={selected}
        onChange={(_, next) => {
          setValue(next);
          setError(null);
        }}
        groupBy={(o) => o.region}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={t('rebellion.turn:activate.noOptions')}
        disabled={isPending}
        size="small"
        data-testid="activation-system-select"
        renderInput={(params) => (
          <TextField {...params} label={t('rebellion.turn:activate.select')} />
        )}
      />
      <Button
        variant="contained"
        startIcon={<BoltIcon />}
        data-testid="activation-confirm"
        disabled={!selected || isPending}
        onClick={() => void submit()}
        sx={{ justifySelf: 'start' }}
      >
        {selected
          ? t('rebellion.turn:activate.confirm', { system: selected.label })
          : t('rebellion.turn:activate.confirmEmpty')}
      </Button>
    </Box>
  );
}
