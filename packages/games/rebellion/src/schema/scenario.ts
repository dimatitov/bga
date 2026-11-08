import { z } from 'zod';
import { PieceSchema, SystemSchema } from './state';

export const RegionSchema = z.strictObject({
  id: z.string(),
  /** i18n key, `regions.<id>` */
  nameKey: z.string(),
});
export type Region = z.infer<typeof RegionSchema>;

/** Input of `createGame`; data lives in the package's `./scenario` subpath. */
export const ScenarioSchema = z.strictObject({
  id: z.string(),
  regions: z.array(RegionSchema),
  systems: z.array(SystemSchema),
  pieces: z.array(PieceSchema),
  rebelBaseSystemId: z.string(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
