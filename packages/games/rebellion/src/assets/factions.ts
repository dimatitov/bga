import { factionEmblems } from './emblems';
import { rebellionVisualTokens, type AssetFactionId } from './tokens';

/**
 * Visual metadata of a faction (SWR-004 spec «Реестр фракций»): display data only, no business logic
 * (the opponent side is `opponentOf` in `./schema`). i18n keys are namespace-qualified
 * (`rebellion.common:…`, plan-frontend §8 `common.json`).
 */
export interface FactionVisual {
  readonly id: AssetFactionId;
  /** Full name, e.g. «Повстанцы». */
  readonly nameKey: string;
  /** Short name for chips / tight layouts. */
  readonly shortNameKey: string;
  /** One-line tagline for the setup card. */
  readonly taglineKey: string;
  /** Original abstract emblem, viewBox `0 0 48 48` (see `emblems.ts`). */
  readonly emblemSvg: string;
  /** Faction colour `#RRGGBB` (= `rebellionVisualTokens.faction`): card stripe, emblem, chips. */
  readonly color: string;
  /** Text/icon colour on a `color` fill (contrast ≥ 4.5:1, unit-tested). */
  readonly onColor: string;
}

const I18N_NS = 'rebellion.common';
/** Dark ink (= board background token) used as text on the light faction fills. */
const darkInk = rebellionVisualTokens.board.background;

function faction(id: AssetFactionId): FactionVisual {
  return Object.freeze({
    id,
    nameKey: `${I18N_NS}:faction.${id}`,
    shortNameKey: `${I18N_NS}:factionShort.${id}`,
    taglineKey: `${I18N_NS}:factionTagline.${id}`,
    emblemSvg: factionEmblems[id],
    color: rebellionVisualTokens.faction[id],
    onColor: darkInk,
  });
}

/** Faction registry of Rebellion, keyed by `AssetFactionId`. */
export const factions: Readonly<Record<AssetFactionId, FactionVisual>> = Object.freeze({
  rebels: faction('rebels'),
  empire: faction('empire'),
});
