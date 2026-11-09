/**
 * @bga/platform — game-independent contracts (Zod + TS): game definitions, session DTOs, the error format,
 * the `ServerGameModule` interface. Depends only on zod; never imports game packages.
 */
export * from './errors';
export * from './api';
export * from './game';
export * from './sessions';
export * from './idempotency';
export * from './validation';
export * from './server-game-module';
export * from './ai-dev';
