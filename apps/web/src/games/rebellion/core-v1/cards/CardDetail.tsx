import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton, Readout, StatusBadge, type StatusTone } from '@/shared/ui/terminal';
import { CARD_DETAIL_ID, useCardParamText } from './cardHelpers';
import {
  CARD_DATA_NS,
  type CardSourceRef,
  type CardVerification,
  cardDefinition,
  cardEffect,
  cardName,
  cardType,
  cardTypeName,
  cardZoneName,
} from './model/catalog';
import { usageForZone } from './model/cardUsage';
import type { CardAuthority, CardZoneKind } from './model/handModel';

const T = terminalTokens;
const C = T.color;
const TITLE_ID = 'card-detail-title';

const EFFECT_TONE: Readonly<Record<string, StatusTone>> = {
  none: 'neutral',
  'not-implemented': 'amber',
  implemented: 'green',
};

export interface CardDetailProps {
  definitionId: string;
  zoneId: string;
  /** Kind of the zone the card lies in: the usage of the card's current role is listed first and marked. */
  zoneKind?: CardZoneKind;
  authority: CardAuthority;
  onClose(): void;
}

function sourceText(t: ReturnType<typeof useTranslation>['t'], source: CardSourceRef): string {
  if (source.kind === 'kb') return source.id;
  return source.section
    ? t('rebellion.cards:detail.sourceBookSection', {
        source: source.sourceId,
        page: source.page,
        section: source.section,
      })
    : t('rebellion.cards:detail.sourceBook', { source: source.sourceId, page: source.page });
}

/** Verification status of a catalog entry: anything but `verified` is an amber «требует проверки» (TC-DET-04). */
export function VerificationBadge({ verification }: { verification: CardVerification }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={verification === 'verified' ? 'green' : 'amber'}
      data-testid="card-detail-verification"
      data-verification={verification}
    >
      {t(`rebellion.cards:verification.${verification}`)}
    </StatusBadge>
  );
}

/**
 * Card Detail (plan-frontend §6, AC-20, S-8): name, type (+ own type description), usage conditions, the supported
 * mechanic / effect status, where the card is and who tracks it, rule sources and the verification status — all from
 * the public catalog + the zone the card lies in. There is no «Play» button (FD-4). On open the heading takes the
 * focus; Esc inside the region and «Закрыть» call `onClose` (the caller returns the focus to the card).
 */
export function CardDetail({
  definitionId,
  zoneId,
  zoneKind,
  authority,
  onClose,
}: CardDetailProps) {
  const { t } = useTranslation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const def = cardDefinition(definitionId);
  const type = def ? cardType(def.typeId) : undefined;
  const effect = def ? cardEffect(def.effectId) : undefined;
  const param = useCardParamText(definitionId);
  const usage = def ? usageForZone(def, zoneKind) : { current: null, ordered: [] };
  /** Marked only when there is a choice: a single-usage card needs no «now» label. */
  const currentUsage = usage.ordered.length > 1 ? usage.current : null;

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: 'nearest' });
  }, [definitionId, zoneId]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  const verification: CardVerification = def?.verification ?? 'unverified';
  return (
    <Box
      role="region"
      id={CARD_DETAIL_ID}
      aria-labelledby={TITLE_ID}
      data-testid="card-detail"
      data-definition-id={definitionId}
      onKeyDown={onKeyDown}
      sx={{
        mt: 1.5,
        border: `1px solid ${C.line}`,
        borderLeft: `3px solid ${C.amber}`,
        p: '10px 12px',
        display: 'grid',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography
          id={TITLE_ID}
          ref={titleRef}
          component="h3"
          variant="subtitle1"
          tabIndex={-1}
          sx={{
            m: 0,
            color: C.paper,
            '&:focus-visible': {
              outline: `${T.focus.width}px solid ${T.focus.color}`,
              outlineOffset: T.focus.offset,
            },
          }}
        >
          {cardName(t, definitionId)}
        </Typography>
        <KeyButton data-testid="card-detail-close" onClick={onClose}>
          {t('rebellion.cards:detail.close')}
        </KeyButton>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {def && (
          <StatusBadge tone="neutral" data-testid="card-detail-type">
            {cardTypeName(t, def.typeId)}
          </StatusBadge>
        )}
        <VerificationBadge verification={verification} />
      </Box>
      {param && (
        <Typography variant="body2" sx={{ color: C.muted }}>
          {param}
        </Typography>
      )}
      {type && (
        <Typography variant="body2" data-testid="card-detail-type-info" sx={{ color: C.paper }}>
          {t(type.descriptionKey, { ns: CARD_DATA_NS })}
        </Typography>
      )}
      {usage.ordered.length > 0 && (
        <Box>
          <Typography component="h4" variant="meta" sx={{ m: 0, color: C.muted }}>
            {t('rebellion.cards:detail.usage')}
          </Typography>
          <Box component="ul" data-testid="card-detail-usage" sx={{ m: 0, pl: 2.5 }}>
            {usage.ordered.map((key) => (
              <Typography
                component="li"
                variant="body2"
                key={key}
                data-current={key === currentUsage ? 'true' : undefined}
                sx={{ color: currentUsage === null || key === currentUsage ? C.paper : C.muted }}
              >
                {key === currentUsage && (
                  <>
                    <StatusBadge tone="green">
                      {t('rebellion.cards:detail.usageCurrent')}
                    </StatusBadge>{' '}
                  </>
                )}
                {t(key, { ns: CARD_DATA_NS })}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {effect && (
        <Readout
          data-testid="card-detail-effect"
          data-effect-status={effect.status}
          label={t('rebellion.cards:detail.effect')}
          value={
            <Box component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 1 }}>
              <span>{t(effect.summaryKey, { ns: CARD_DATA_NS })}</span>
              <StatusBadge tone={EFFECT_TONE[effect.status] ?? 'neutral'}>
                {t(`rebellion.cards:detail.effectStatus.${effect.status}`)}
              </StatusBadge>
            </Box>
          }
        />
      )}
      <Readout
        data-testid="card-detail-where"
        label={t('rebellion.cards:detail.where')}
        value={cardZoneName(t, zoneId)}
      />
      <Readout
        data-testid="card-detail-authority"
        data-authority={authority}
        label={t('rebellion.cards:detail.authorityLabel')}
        value={t(`rebellion.cards:detail.authority.${authority}`)}
      />
      {def && (
        <Box>
          <Typography component="h4" variant="meta" sx={{ m: 0, color: C.muted }}>
            {t('rebellion.cards:detail.sources')}
          </Typography>
          <Box component="ul" data-testid="card-detail-sources" sx={{ m: 0, pl: 2.5 }}>
            {def.sources.map((source) => (
              <Typography
                component="li"
                variant="body2"
                key={source.kind === 'kb' ? source.id : `${source.sourceId}-${source.page}`}
                sx={{ color: C.paper, fontFamily: T.font.family }}
              >
                {sourceText(t, source)}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
