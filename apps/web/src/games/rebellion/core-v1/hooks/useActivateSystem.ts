/**
 * `ACTIVATE_SYSTEM` from the map (SWR-005 plan-frontend §5.2): a click on a highlighted target with an armed leader,
 * or a leader dropped from the pool. The pair is checked against `legalActions` (`viewModel.canActivate`) before
 * sending — no request for a target the server did not list. Sending, feedback, inline errors (`activation-error`)
 * and focus are P1's `useTurnCommands().activate` (single path for panel and map).
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '@/shared/feedback';
import type { CommandOutcome } from '../../board/model/boardContext';
import { useCoreBoard } from '../model/coreContext';
import { canActivate, systemById } from '../model/viewModel';
import { useTurnCommands } from '../panels/useTurnCommands';

export function useActivateSystem(): (
  leaderId: string,
  systemId: string,
) => Promise<CommandOutcome | null> {
  const { view } = useCoreBoard();
  const { activate } = useTurnCommands();
  const { t } = useTranslation();
  return useCallback(
    async (leaderId, systemId) => {
      if (!canActivate(view, leaderId, systemId)) {
        const nameKey = systemById(view, systemId)?.nameKey ?? `systems.${systemId}`;
        announce(t('rebellion.map:drop.notTarget', { system: t(`rebellion.data:${nameKey}`) }));
        return null;
      }
      return activate(leaderId, systemId);
    },
    [activate, t, view],
  );
}
