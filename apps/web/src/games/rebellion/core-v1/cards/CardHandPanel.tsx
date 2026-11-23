import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton, StatusBadge, TerminalModule } from '@/shared/ui/terminal';
import { useCoreBoard } from '../model/coreContext';
import { coreFactionName } from '../sidebar/coreLogMessage';
import { CardDetail } from './CardDetail';
import { CardsNotTracked } from './CardsNotTracked';
import { CardZoneSection } from './CardZoneSection';
import { OpponentCounts } from './OpponentCounts';
import { cardTypeName, cardZoneName } from './model/catalog';
import { useCardUiStore } from './model/cardUiStore';
import { handModel, visibleCards, type HandModel } from './model/handModel';

const C = terminalTokens.color;

export interface CardHandPanelProps {
  /**
   * Called by «Зарегистрировать карту базы» (`card-hand-register`), shown only while `view.table.registration` is
   * pending and the viewer is the Rebels. The registration form lives in the Physical Execution panel (FE-B): pass
   * `() => focusWhenReady(LOCATION_REGISTER_SELECT_ID)`. Without it the hint shows only the «не зарегистрирована» text.
   */
  onRequestRegister?: () => void;
}

/**
 * Content of the Cards tab of the `core-v1` console (SWR-010 FE-A, plan-frontend §3.1, §5.2, AC-19): «Ваши карты»
 * (zones of the viewer), «Соперник» (counts only, cards only if the server sent them), «Общее» (deck count + the public
 * cards out of the game), «Пока не отслеживаются» (deferred catalog types), then the Card Detail of the selected card.
 * Data: only `view.cards` / `view.table.registration` of the session cache + the public catalog. A legacy game
 * (`view.cards === null`) shows «В этой партии карты не отслеживаются».
 */
export function CardHandPanel({ onRequestRegister }: CardHandPanelProps = {}) {
  const { t } = useTranslation();
  const { view, sessionId } = useCoreBoard();
  const reconcile = useCardUiStore((s) => s.reconcile);
  const selected = useCardUiStore((s) => s.selected);
  const clear = useCardUiStore((s) => s.clear);
  const model = useMemo(() => handModel(view), [view]);

  useEffect(() => {
    reconcile(view, sessionId);
  }, [view, sessionId, reconcile]);

  if (!model.tracked) return <CardsNotTracked viewer={model.viewer} />;

  const opponentSide = model.viewer === 'rebels' ? 'empire' : 'rebels';
  const shown = selected
    ? visibleCards(model).find(
        (c) => c.definitionId === selected.definitionId && c.zone.id === selected.zoneId,
      )
    : undefined;
  const closeDetail = () => {
    const id = selected?.definitionId;
    clear();
    if (id) document.getElementById(`card-hand-item-${id}`)?.focus();
  };

  return (
    <Box
      data-testid="card-hand"
      data-tracked="true"
      data-viewer={model.viewer}
      sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}
    >
      <TerminalModule dense headingLevel="h3" label={t('rebellion.cards:hand.own')}>
        <OwnZones model={model} onRequestRegister={onRequestRegister} />
      </TerminalModule>
      {model.opponent.length > 0 && (
        <TerminalModule
          dense
          headingLevel="h3"
          tone="restricted"
          label={t('rebellion.cards:hand.opponent', { side: coreFactionName(t, opponentSide) })}
        >
          <OpponentCounts zones={model.opponent} />
        </TerminalModule>
      )}
      <TerminalModule dense headingLevel="h3" label={t('rebellion.cards:hand.shared')}>
        {model.deck && (
          <Typography
            variant="body2"
            data-testid="card-deck-count"
            data-count={model.deck.count}
            sx={{ color: C.paper, mb: model.removed ? 1.25 : 0 }}
          >
            {t('rebellion.cards:hand.deckCount', {
              zone: cardZoneName(t, model.deck.id),
              count: model.deck.count,
            })}
          </Typography>
        )}
        {model.removed && <CardZoneSection zone={model.removed} />}
      </TerminalModule>
      {model.deferredTypeIds.length > 0 && (
        <TerminalModule dense headingLevel="h3" label={t('rebellion.cards:hand.deferred')}>
          <Typography variant="caption" sx={{ display: 'block', color: C.muted, mb: 0.75 }}>
            {t('rebellion.cards:hand.deferredHint')}
          </Typography>
          <Box
            component="ul"
            data-testid="card-hand-deferred"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}
          >
            {model.deferredTypeIds.map((id) => (
              <li key={id}>
                <StatusBadge tone="neutral">{cardTypeName(t, id)}</StatusBadge>
              </li>
            ))}
          </Box>
        </TerminalModule>
      )}
      {shown && (
        <CardDetail
          definitionId={shown.definitionId}
          zoneId={shown.zone.id}
          zoneKind={shown.zone.kind}
          authority={shown.zone.authority}
          onClose={closeDetail}
        />
      )}
    </Box>
  );
}

function OwnZones({
  model,
  onRequestRegister,
}: {
  model: HandModel;
  onRequestRegister?: () => void;
}) {
  const { t } = useTranslation();
  if (model.own.length === 0)
    return (
      <Typography variant="body2" sx={{ color: C.muted }}>
        {t('rebellion.cards:hand.empty')}
      </Typography>
    );
  const pending = model.locationState === 'notRegistered';
  return (
    <>
      {model.own.map((zone) => {
        // The Location of the human Rebels before the physical registration (no preliminary system is shown).
        const unregistered = pending && zone.kind === 'special' && zone.count === 0;
        return (
          <CardZoneSection
            key={zone.id}
            zone={zone}
            emptyText={unregistered ? t('rebellion.cards:hand.notRegistered') : undefined}
          >
            {unregistered && model.viewer === 'rebels' && onRequestRegister && (
              <KeyButton
                tone="primary"
                data-testid="card-hand-register"
                onClick={onRequestRegister}
                sx={{ mt: 0.75 }}
              >
                {t('rebellion.cards:hand.register')}
              </KeyButton>
            )}
          </CardZoneSection>
        );
      })}
    </>
  );
}
