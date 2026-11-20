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
export { upcastEvent, upcastSettings, upcastState, upcastStoredSetup } from './upcast';
