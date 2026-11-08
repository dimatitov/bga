import { z } from 'zod';
import { CommandErrSchema } from '@bga/platform';
import { GameEventSchema } from './state';
import { PlayerViewSchema } from './view';

export const CommandOkSchema = z.strictObject({
  ok: z.literal(true),
  view: PlayerViewSchema,
  events: z.array(GameEventSchema),
});
export type CommandOk = z.infer<typeof CommandOkSchema>;

export const CommandResultSchema = z.discriminatedUnion('ok', [CommandOkSchema, CommandErrSchema]);
export type CommandResult = z.infer<typeof CommandResultSchema>;
