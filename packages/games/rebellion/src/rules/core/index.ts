/**
 * `core-v1` engine (SWR-005 W3; specification "Rules (ревизия 2)" R-1..R-10, D-1..D-7). Pure and
 * deterministic: imports only `../../schema` and `@bga/platform`; time comes from the contexts.
 * - `./create` — `createCoreGame` (R-1, R-2, R-10), `./base` — `chooseRebelBase` (FNV-1a, D-4);
 * - `./apply` — command pipeline and check order; `./activation` (R-4), `./movement` (R-5 + capacity),
 *   `./turn-flow` (R-3, R-6, R-7, hot-seat), `./victory` (R-8, R-9);
 * - `./legal` — legal actions; `./redact` — THE single redaction point (views and events).
 */
export { applyCoreCommand } from './apply';
export { chooseRebelBase, fnv1a32 } from './base';
export { createCoreGame } from './create';
export { coreLegalActions } from './legal';
export { corePlayerEvents, coreSideView, hiddenBaseFor } from './redact';
