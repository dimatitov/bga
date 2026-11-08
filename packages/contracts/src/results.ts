import { z } from 'zod';
import { ApiErrorSchema } from './errors';
import { GameEventSchema } from './state';
import { PlayerViewSchema } from './view';

export const CommandOkSchema = z.strictObject({
  ok: z.literal(true),
  view: PlayerViewSchema,
  events: z.array(GameEventSchema),
});
export type CommandOk = z.infer<typeof CommandOkSchema>;

export const CommandErrSchema = z.strictObject({
  ok: z.literal(false),
  error: ApiErrorSchema,
});
export type CommandErr = z.infer<typeof CommandErrSchema>;

export const CommandResultSchema = z.discriminatedUnion('ok', [CommandOkSchema, CommandErrSchema]);
export type CommandResult = z.infer<typeof CommandResultSchema>;
