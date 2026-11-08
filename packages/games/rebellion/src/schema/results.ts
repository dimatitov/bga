import { z } from 'zod';
import { CommandErrSchema } from '@bga/platform';
import { PlayerEventSchema } from './state';
import { PlayerViewSchema } from './view';

export const CommandOkSchema = z.strictObject({
  ok: z.literal(true),
  view: PlayerViewSchema,
  /** Events of the command as the viewer may see them (redacted for core-v1; `[]` during a handoff). */
  events: z.array(PlayerEventSchema),
});
export type CommandOk = z.infer<typeof CommandOkSchema>;

export const CommandResultSchema = z.discriminatedUnion('ok', [CommandOkSchema, CommandErrSchema]);
export type CommandResult = z.infer<typeof CommandResultSchema>;
