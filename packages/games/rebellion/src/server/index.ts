/**
 * `@bga/game-rebellion/server` — the Rebellion `ServerGameModule` (wires definition + schema + rules +
 * scenario) and the upcaster of stored data. Server only: never imported by web.
 */
export { createCoreInitialState, rebellionServerModule } from './rebellion-server-module';
export {
  MAX_AUTO_STEPS,
  aiSideOf,
  runAutoPlay,
  type AutoPlayOptions,
  type AutoPlayResult,
} from './auto-play';
export { upcastEvent, upcastSettings, upcastState, upcastStoredSetup } from './upcast';
