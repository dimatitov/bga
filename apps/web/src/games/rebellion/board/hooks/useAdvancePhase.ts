import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/shared/feedback';
import type { TFunction } from 'i18next';
import { type CommandSender, useBoard } from '../model/boardContext';
import { reportCommandFailure } from '../model/commandFeedback';
import { phaseName } from '../model/labels';
import { canAdvancePhase } from '../model/legal';

async function advanceOnce(send: CommandSender['send'], t: TFunction): Promise<void> {
  const outcome = await send({ type: 'ADVANCE_PHASE' });
  if (outcome.ok) {
    notify({
      severity: 'success',
      message: t('rebellion.board:phase.advanced', {
        round: outcome.view.round,
        phase: phaseName(t, outcome.view.phase),
      }),
    });
  } else {
    reportCommandFailure(t, outcome, () => void advanceOnce(send, t));
  }
}

/** MOCK "End phase" (scenario 7): enabled only if `ADVANCE_PHASE` is in legalActions (D-T-3). */
export function useAdvancePhase(): {
  advance(): Promise<void>;
  enabled: boolean;
  isPending: boolean;
} {
  const { view, send, isPending } = useBoard();
  const { t } = useTranslation();
  const advance = useCallback(() => advanceOnce(send, t), [send, t]);
  return { advance, enabled: canAdvancePhase(view) && !isPending, isPending };
}
