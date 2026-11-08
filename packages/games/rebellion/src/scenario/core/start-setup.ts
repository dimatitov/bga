/**
 * Fixed starting position of `core-v1` (spec R-10, D-5, D-6): the first-game setup.
 * Source: `docs/game-rules/rebellion-reference.md`
 * - units per system and on the "Rebel Base" space — §4.2 (Learn to Play p.16, confidence high);
 *   loyalty/subjugation markers of §4.2 are not modelled (D-5);
 * - time marker 1, reputation 14 — §4.1 step 3 (confidence high);
 * - starting leader pools — §3 (confidence high);
 * - `baseIneligibleSystemIds` — Coruscant (no probe card, §1.1) + the 5 probe cards removed in the first game
 *   (§4.2: Corellia, Mandalore, Saleucami, Sullust, Mustafar). The remaining first-game rule (no system with or
 *   adjacent to an Imperial unit, §4.2 "Base choice") is derived by `eligibleRebelBaseSystemIds`.
 * Unit order = order of `units` → unit ids `u-01…` (never depends on the base; plan-backend §2).
 */
import {
  CORE_LEADER_IDS,
  type CoreSystemId,
  type CoreUnitTypeKey,
  type StartPlacement,
  type StartSetup,
} from '../../schema';

type Group = readonly (readonly [CoreUnitTypeKey, number])[];

function place(at: StartPlacement, group: Group): StartSetup['units'] {
  return group.flatMap(([typeKey, count]) =>
    Array.from({ length: count }, () => ({ typeKey, at: { ...at } })),
  );
}

const inSystem = (systemId: CoreSystemId): StartPlacement => ({ kind: 'system', systemId });

const units: StartSetup['units'] = [
  // Rebels (§4.2)
  ...place(inSystem('bothawui'), [
    ['unit.rebels.corellian-corvette', 1],
    ['unit.rebels.rebel-transport', 1],
    ['unit.rebels.x-wing', 1],
    ['unit.rebels.y-wing', 1],
    ['unit.rebels.rebel-trooper', 3],
    ['unit.rebels.airspeeder', 1],
  ]),
  ...place({ kind: 'rebelBase' }, [
    ['unit.rebels.x-wing', 1],
    ['unit.rebels.y-wing', 1],
    ['unit.rebels.rebel-trooper', 3],
    ['unit.rebels.airspeeder', 1],
  ]),
  // Empire (§4.2)
  ...place(inSystem('saleucami'), [
    ['unit.empire.star-destroyer', 1],
    ['unit.empire.tie-fighter', 2],
    ['unit.empire.stormtrooper', 2],
    ['unit.empire.at-st', 1],
  ]),
  ...place(inSystem('mandalore'), [
    ['unit.empire.death-star', 1],
    ['unit.empire.tie-fighter', 4],
    ['unit.empire.stormtrooper', 2],
    ['unit.empire.at-st', 1],
  ]),
  ...place(inSystem('coruscant'), [
    ['unit.empire.star-destroyer', 1],
    ['unit.empire.assault-carrier', 1],
    ['unit.empire.tie-fighter', 2],
    ['unit.empire.stormtrooper', 3],
    ['unit.empire.at-at', 1],
    ['unit.empire.at-st', 1],
  ]),
  ...place(inSystem('corellia'), [
    ['unit.empire.assault-carrier', 1],
    ['unit.empire.stormtrooper', 1],
  ]),
  ...place(inSystem('sullust'), [
    ['unit.empire.star-destroyer', 1],
    ['unit.empire.tie-fighter', 2],
    ['unit.empire.stormtrooper', 2],
    ['unit.empire.at-st', 1],
  ]),
  ...place(inSystem('mustafar'), [
    ['unit.empire.assault-carrier', 1],
    ['unit.empire.tie-fighter', 2],
    ['unit.empire.stormtrooper', 2],
    ['unit.empire.at-st', 1],
  ]),
];

const baseIneligibleSystemIds: CoreSystemId[] = [
  'coruscant',
  'corellia',
  'mandalore',
  'saleucami',
  'sullust',
  'mustafar',
];

export const coreStartSetup: StartSetup = {
  startingTime: 1,
  startingReputation: 14,
  units,
  leaders: [...CORE_LEADER_IDS],
  baseIneligibleSystemIds,
};
