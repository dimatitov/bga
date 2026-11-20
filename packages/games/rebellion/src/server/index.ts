/**
 * `@bga/game-rebellion/server` — the Rebellion `ServerGameModule` (wires definition + schema + rules +
 * scenario) and the upcaster of stored data. Server only: never imported by web.
 */
export {
  createCoreInitialState,
  createRebellionServerModule,
  rebellionServerModule,
} from './rebellion-server-module';
export { aiSideOf, createRebellionAutomation, type RebellionAutomationOptions } from './automation';
export {
  REBELLION_ENGINE_SCOPE_RULE_ID,
  REBELLION_KNOWLEDGE_BASE_DIR,
  REBELLION_TAG_RULES,
  rebellionRules,
} from './rules-context';
export { upcastEvent, upcastSettings, upcastState, upcastStoredSetup } from './upcast';
