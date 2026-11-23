import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { TableView } from '@bga/game-rebellion/schema';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton } from '@/shared/ui';
import { cardName } from '../cards/model/catalog';
import { LOCATION_REGISTER_SELECT_ID } from '../panels/focus';
import { TABLE_NS } from './model/tableModel';
import { RegisterConfirmDialog } from './RegisterConfirmDialog';
import { useTableCommands } from './useTableCommands';

type Registration = NonNullable<TableView['registration']>;

const HINT_ID = 'core-location-register-hint';

/**
 * Location registration of a human Rebel player in a physical game (SWR-010 FE-B, plan-frontend §3.2, AC-10, TC-PX-02):
 * a native select whose options are exactly the server's `registration.eligibleDefinitionIds` (card names = system
 * names, sorted by the localized name; no option is preselected), «Register» → `RegisterConfirmDialog` →
 * `REGISTER_CARD { zoneId: registration.zoneId, definitionId }`. Nothing here knows which system the server proposed.
 */
export function LocationRegisterForm({ registration }: { registration: Registration }) {
  const { t, i18n } = useTranslation();
  const { register, isPending } = useTableCommands();
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(true);
  const lng = i18n.resolvedLanguage ?? i18n.language;

  const options = useMemo(
    () =>
      registration.eligibleDefinitionIds
        .map((id) => ({ id, name: cardName(t, id) }))
        .sort((a, b) => a.name.localeCompare(b.name, lng)),
    [registration.eligibleDefinitionIds, t, lng],
  );
  const chosen = options.find((o) => o.id === value) ?? null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chosen || isPending) return;
    setRestoreFocus(true);
    setConfirming(true);
  };

  return (
    <Box
      component="form"
      noValidate
      onSubmit={onSubmit}
      data-testid="location-register-form"
      aria-describedby={HINT_ID}
      sx={{ display: 'grid', gap: 1 }}
    >
      <Typography id={HINT_ID} variant="body2" sx={{ color: terminalTokens.color.warm }}>
        {t(`${TABLE_NS}:register.hint`)}
      </Typography>
      <TextField
        select
        id={LOCATION_REGISTER_SELECT_ID}
        label={t(`${TABLE_NS}:register.label`)}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isPending}
        size="small"
        slotProps={{
          select: { native: true },
          inputLabel: { shrink: true },
          htmlInput: { 'data-testid': 'location-register-select' },
        }}
      >
        <option value="" disabled>
          {t(`${TABLE_NS}:register.placeholder`)}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </TextField>
      <KeyButton
        type="submit"
        tone="primary"
        led={chosen && !isPending ? 'green' : 'off'}
        disabled={!chosen || isPending}
        aria-busy={isPending || undefined}
        data-testid="location-register-submit"
      >
        {t(`${TABLE_NS}:register.submit`)}
      </KeyButton>
      <RegisterConfirmDialog
        open={confirming}
        systemName={chosen?.name ?? ''}
        restoreFocus={restoreFocus}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setRestoreFocus(false);
          setConfirming(false);
          if (chosen) void register(chosen.id);
        }}
      />
    </Box>
  );
}
