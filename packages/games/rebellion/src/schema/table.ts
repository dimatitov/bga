import { z } from 'zod';
import { CardIdSchema } from '@bga/platform/cards';
import { ActorSchema } from './enums';

/**
 * SWR-010 (plan-backend §5.2, §11.3): Physical Sync v0 — the queue of physical-table tasks of a
 * `physical_companion` game. Built once from the human's (redacted) view and never changed afterwards.
 */

export const TABLE_TASK_KINDS = [
  'initialSetup',
  'registerBase',
  'aiActivation',
  'aiMove',
  'refresh',
  'baseRevealed',
] as const;
export const TableTaskKindSchema = z.enum(TABLE_TASK_KINDS);
export type TableTaskKind = z.infer<typeof TableTaskKindSchema>;

export const TABLE_STEP_KEYS = [
  'table.steps.setupFirstGame', // {}
  'table.steps.removeProbeCards', // { definitionIds: string[] }
  'table.steps.setAsideReferenceStack', // {}
  'table.steps.placeLocationPlaceholder', // {}
  'table.steps.registerBaseCard', // {}
  'table.steps.placeLeader', // { leaderId, systemId: string|null }
  'table.steps.moveUnits', // { unitIds: string[], fromSystemId: string|null, toSystemId: string|null }
  'table.steps.returnLeaders', // { leaderIds: string[] }
  'table.steps.takeProbeCards', // { definitionIds: string[] }   (human Empire only)
  'table.steps.opponentDrewProbeCards', // { count: number }     (human Rebels only)
  'table.steps.advanceTime', // { from: number, to: number }
  'table.steps.revealBase', // { systemId }  (AI Rebels' base, human Empire)
  'table.steps.revealOwnBase', // { systemId }  (human Rebels)
  'table.steps.moveBaseUnits', // { systemId }
] as const;
export type TableStepKey = (typeof TABLE_STEP_KEYS)[number];

export const TableParamValueSchema = z.union([z.string(), z.int(), z.null(), z.array(z.string())]);
export const TableStepSchema = z.strictObject({
  key: z.enum(TABLE_STEP_KEYS),
  params: z.record(z.string().regex(/^[a-zA-Z]{1,32}$/), TableParamValueSchema),
});
export type TableStep = z.infer<typeof TableStepSchema>;

export const TableTaskSchema = z.strictObject({
  id: z.string().regex(/^t-[1-9][0-9]*-[1-9][0-9]*$/),
  kind: TableTaskKindSchema,
  actor: ActorSchema,
  /** `table.tasks.<kind>` */
  titleKey: z.string().regex(/^table\.tasks\.[a-zA-Z]+$/),
  createdAtVersion: z.int().positive(),
  affected: z.strictObject({
    cardDefinitionIds: z.array(CardIdSchema),
    leaderIds: z.array(z.string()),
    unitIds: z.array(z.string()),
    /** `null` = the "Rebel Base" space (hidden zone of the viewer). */
    systemIds: z.array(z.string().nullable()),
  }),
  steps: z.array(TableStepSchema).min(1),
  /** `register` only for kind `registerBase`. */
  completion: z.enum(['confirm', 'register']),
});
export type TableTask = z.infer<typeof TableTaskSchema>;

export const CoreTableStateSchema = z.strictObject({
  tasks: z.array(TableTaskSchema),
  baseRegistration: z
    .strictObject({ eligibleSystemIds: z.array(z.string().min(1)).min(1) })
    .nullable(),
});
export type CoreTableState = z.infer<typeof CoreTableStateSchema>;

export const TableViewSchema = z.strictObject({
  tasks: z.array(TableTaskSchema),
  /** Queue non-empty, game running and the AI side is the active side. */
  aiWaiting: z.boolean(),
  registration: z
    .strictObject({
      zoneId: z.literal('rebels-location'),
      eligibleDefinitionIds: z.array(CardIdSchema).min(1),
    })
    .nullable(),
});
export type TableView = z.infer<typeof TableViewSchema>;
