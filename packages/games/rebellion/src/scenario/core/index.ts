/**
 * Static base-game data of the `core-v1` engine (SWR-005 W2), assembled and integrity-checked at load
 * (`CoreDataSchema.parse` fails fast). Facts: `docs/game-rules/rebellion-reference.md` (see the module headers).
 * Server-only subpath (`./scenario`); the web reads only the id lists in `./schema` (`core-ids.ts`).
 */
import { CoreDataSchema, type CoreData } from '../../schema';
import { coreLeaders, coreUnitTypes } from './catalog';
import { coreRegions, coreSystems } from './map';
import { coreStartSetup } from './start-setup';

export const CORE_DATA_BASE_V1_ID = 'rebellion-base-v1';

export const coreDataBaseV1: CoreData = CoreDataSchema.parse({
  id: CORE_DATA_BASE_V1_ID,
  regions: coreRegions,
  systems: coreSystems,
  unitTypes: coreUnitTypes,
  leaders: coreLeaders,
  startSetup: coreStartSetup,
});
