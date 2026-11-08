/**
 * Web game registry contract (SWR-003 plan-frontend §4, TR-5) — FROZEN after FE-PLATFORM P1.
 * Types only: imports `@bga/platform` and react/i18next types. Platform code reads these types via
 * `@/games/registry` (ESLint B-9); game folders import them from `@/games/types` (B-17).
 */
import type { GameDefinition, SessionStatus, SessionSummary } from '@bga/platform';
import type { TFunction } from 'i18next';
import type { ComponentType, LazyExoticComponent } from 'react';

/** Session creation handle the platform passes to a game's setup screen (`useCreateSession`). */
export interface StartSession {
  /** `POST /api/sessions { gameId, setup }` → cache → `/sessions/:id` (replace). Ignored while pending. */
  submit(setup: unknown): void;
  isPending: boolean;
  /** Last creation error (`ApiError` or other), `null` when none. The setup screen shows it (D-NS-3). */
  error: unknown;
  reset(): void;
}

export interface SetupScreenProps {
  gameId: string;
  definition: GameDefinition;
  /** Session creation is done by the platform: POST /api/sessions { gameId, setup } → /sessions/:id (replace). */
  start: StartSession;
  /** Where "Cancel" leads — the game page (the "← To game" link above the form is drawn by the platform, Q-19). */
  backHref: string;
}

export interface TableScreenProps {
  sessionId: string;
  gameId: string;
  /** Platform lifecycle status of the session (`SessionResponse.status`, SWR-004 AM-FE-3). */
  status: SessionStatus;
  /** Current view from the cache `sessionKeys.detail(sessionId)`; the game parses it with its own schema (TR-5). */
  view: unknown;
  definition: GameDefinition;
  /** "← To game" in the table top bar (`session-back-to-game`) — the game page (D-SH-4). */
  backHref: string;
}

export interface GameCover {
  /** `data:image/svg+xml` URL of the game's own abstract SVG (16:9) from `GameAssets.cover.svg`. Alt — `definition.coverAltKey`. */
  src: string;
  /** `GameAssets.accentColor` — accent stripe of the catalogue card (D-CAT-5). */
  accentColor?: string;
}

/**
 * One part of a game's session line (SWR-004 AM-FE-9). The platform renders each part as
 * `<span data-testid="recent-session-<key>">text</span>`, joined by « · », without knowing what `key` means.
 */
export interface SessionLinePart {
  /** Stable id of the part (`[a-z][a-z0-9-]*`), used in the test id. */
  key: string;
  text: string;
}

/** Result of `describeSession`: a plain line (SWR-003) or parts; `''` / `[]` → generic platform text. */
export type SessionDescription = string | readonly SessionLinePart[];

export interface WebGameEntry {
  definition: GameDefinition;
  /** Missing → platform placeholder cover + alt `common:cover.placeholderAlt` (TC-EXT-07). */
  cover?: GameCover;
  /** Prefix of the game's i18n namespaces = folder name `src/games/<prefix>/` (`rebellion` → `rebellion.board`, …). */
  i18nPrefix: string;
  /**
   * Session line for "Continue"/"Recent" from `SessionSummary.details` — a string or parts (AM-FE-9);
   * missing, `''`, `[]` or throwing → generic platform text.
   */
  describeSession?: (summary: SessionSummary, t: TFunction) => SessionDescription;
  /** Default-exported component behind `React.lazy` (code splitting, not loading games by name — AC-9). */
  SetupScreen?: LazyExoticComponent<ComponentType<SetupScreenProps>>;
  TableScreen?: LazyExoticComponent<ComponentType<TableScreenProps>>;
}
