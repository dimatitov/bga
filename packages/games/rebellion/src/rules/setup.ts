import { toValidationIssues, type SetupParseResult } from '@bga/platform';
import {
  REBELLION_ERROR_MESSAGE_KEYS,
  RebellionSetupInputSchema,
  settingsFromSetupInput,
  unsupportedSetupFields,
  type RebellionSettings,
} from '../schema';

/**
 * Client `setup` → settings (pure; spec "Rebellion: фракции и настройки", Q-6..Q-8):
 * 1. schema (`RebellionSetupInputSchema`, strict) → `invalid` (400); issue paths are relative to `setup`;
 * 2. availability → `unsupported` (422 SETUP_UNSUPPORTED): `messageKey` of the first unsupported field
 *    (ruleset before gameMode), `details.unsupported` lists all of them (AM-BE-8);
 * 3. settings: `opponentFaction = opponentOf(playerFaction)`, AI difficulty default 'normal', human → null.
 * Never throws for client input.
 */
export function parseRebellionSetup(input: unknown): SetupParseResult<RebellionSettings> {
  const parsed = RebellionSetupInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, kind: 'invalid', issues: toValidationIssues(parsed.error) };
  }
  const unsupported = unsupportedSetupFields(parsed.data);
  const first = unsupported[0];
  if (first !== undefined) {
    return {
      ok: false,
      kind: 'unsupported',
      messageKey:
        first === 'ruleset'
          ? REBELLION_ERROR_MESSAGE_KEYS.rulesetUnavailable
          : REBELLION_ERROR_MESSAGE_KEYS.modeUnavailable,
      details: { unsupported },
    };
  }
  return { ok: true, value: settingsFromSetupInput(parsed.data) };
}
