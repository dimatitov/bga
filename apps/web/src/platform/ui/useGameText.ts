import { useTranslation } from 'react-i18next';
import type { WebGameEntry } from '@/games/registry';
import { placeholderCoverSvg } from './placeholderCover';
import { svgDataUrl } from './svgDataUrl';

const PLACEHOLDER_SRC = svgDataUrl(placeholderCoverSvg);

export interface GameText {
  /** Proper name from the definition, never translated (Q-11). */
  name: string;
  description: string;
  coverSrc: string;
  coverAlt: string;
}

/** Texts and cover of a game entry (plan-frontend §5.3). */
export function useGameText(entry: WebGameEntry): GameText {
  const { t } = useTranslation();
  const { definition, cover } = entry;
  const description = t(definition.descriptionKey, {
    defaultValue: definition.description ?? '',
  });
  const coverAlt =
    cover && definition.coverAltKey
      ? t(definition.coverAltKey, { defaultValue: t('common:cover.placeholderAlt') })
      : t('common:cover.placeholderAlt');
  return {
    name: definition.name,
    description,
    coverSrc: cover?.src ?? PLACEHOLDER_SRC,
    coverAlt,
  };
}
