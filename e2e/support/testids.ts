// data-testid catalogue (SWR-005: + core-v1 table, plan-frontend §9): SWR-002 plan-frontend §6.1 (R-10) + SWR-003 TR-1 / plan-frontend §7 (owner: QA, R-3)
// + SWR-004 TR-1 / plan-frontend §7 (`mock-badge` on the table → `prototype-badge`, `setup-mock-badge` →
// `setup-prototype-note`, `setup-faction` group → `setup-faction-group`; OQ-2: `game-recent-loading|empty` stay).
// Language-independent selectors only. SWR-002 main-menu ids (`menu-*`, `recent-games`, `recent-game-*`) are gone.
import { type Page } from '@playwright/test';

export const T = {
  // platform header (TR-1)
  appHeader: 'app-header',
  navCatalog: 'nav-catalog',
  navSettings: 'nav-settings',
  // catalog `/` (TR-1)
  gameCatalog: 'game-catalog',
  gameCard: (gameId: string) => `game-card-${gameId}`,
  gameCardName: 'game-card-name',
  gameCardCover: 'game-card-cover',
  gameCardDescription: 'game-card-description',
  gameCardStatus: 'game-card-status',
  gameCardPlayers: 'game-card-players',
  gameCardAi: 'game-card-ai',
  // game page `/games/:gameId` (TR-1)
  gamePage: 'game-page',
  gamePageCover: 'game-page-cover',
  gamePageName: 'game-page-name',
  gamePageDescription: 'game-page-description',
  gamePagePlayers: 'game-page-players',
  gamePageAi: 'game-page-ai',
  gameNewSession: 'game-new-session',
  gameContinue: 'game-continue',
  gameComingSoon: 'game-coming-soon',
  gameRecentSessions: 'game-recent-sessions',
  /** OQ-2: existing names kept (TR-1 `game-sessions-loading|empty` were not introduced). */
  gameRecentLoading: 'game-recent-loading',
  gameRecentEmpty: 'game-recent-empty',
  gameContinueHint: 'game-continue-hint',
  /** SWR-004: status chip in the "Continue" hint (`data-status`). */
  gameContinueStatus: 'game-continue-status',
  recentSession: (sessionId: string) => `recent-session-${sessionId}`,
  /** SWR-004 parts of a recent-session row (inside `recent-session-<id>`, plan-frontend §3/§7.1, AM-FE-9). */
  recentSessionFaction: 'recent-session-faction',
  recentSessionOpponent: 'recent-session-opponent',
  recentSessionProgress: 'recent-session-progress',
  /** chip with `data-status` */
  recentSessionStatus: 'recent-session-status',
  /** `<time dateTime>` */
  recentSessionDate: 'recent-session-date',
  /** SWR-005: «Старый прототип» part of a legacy (mock-v1) row */
  recentSessionEngine: 'recent-session-engine',
  /** SWR-005: winner part of a completed core-v1 row */
  recentSessionOutcome: 'recent-session-outcome',
  gameSessionsError: 'game-sessions-error',
  gameBackToCatalog: 'game-back-to-catalog',
  /** unknown `gameId` on `/games/:gameId` and `/games/:gameId/new` */
  gameNotFound: 'game-not-found',
  // new session `/games/:gameId/new`
  newSessionPage: 'new-session-page',
  newSessionBackToGame: 'new-session-back-to-game',
  // session host `/sessions/:sessionId` (TR-1)
  sessionHost: 'session-host',
  sessionNotFound: 'session-not-found',
  sessionUnsupported: 'session-unsupported',
  sessionBackToGame: 'session-back-to-game',
  // Rebellion setup form (SWR-004 plan-frontend §2.1, §7.1)
  /** `<form>` with `aria-busy` */
  setupForm: 'setup-form',
  /** radiogroup of the faction cards (was `setup-faction`) */
  setupFactionGroup: 'setup-faction-group',
  /** faction card: `role="radio"`, `aria-checked`, `data-selected`, `data-value` */
  setupFaction: (f: 'empire' | 'rebels') => `setup-faction-${f}`,
  /** radiogroup of the opponent type */
  setupOpponentGroup: 'setup-opponent',
  setupOpponent: (k: 'ai' | 'human') => `setup-opponent-${k}`,
  /** "AI plays the …" / "Second player plays the …" — `data-opponent-faction`, `aria-live="polite"` */
  setupOpponentCaption: 'setup-opponent-caption',
  setupDifficulty: 'setup-difficulty',
  setupDifficultyOption: (d: 'easy' | 'normal' | 'hard') => `setup-difficulty-${d}`,
  setupRuleset: 'setup-ruleset',
  setupRulesetOption: (r: 'base' | 'rise-of-the-empire') => `setup-ruleset-${r}`,
  setupMode: 'setup-mode',
  setupModeOption: (m: 'digital' | 'physical_companion') => `setup-mode-${m}`,
  /** replaces `setup-mock-badge` (removed in SWR-004) */
  setupPrototypeNote: 'setup-prototype-note',
  /** `aria-busy` while the request is in flight */
  setupStart: 'setup-start',
  setupCancel: 'setup-cancel',
  /** `role="alert"` */
  setupError: 'setup-error',
  // table
  gameTable: 'game-table',
  roundIndicator: 'round-indicator',
  phaseIndicator: 'phase-indicator',
  advancePhase: 'advance-phase',
  /** replaces the table `mock-badge` (SWR-004); `data-status`, SWR-005: `data-variant` (core-v1 | legacy | generic) */
  prototypeBadge: 'prototype-badge',
  /** "Turn: <side>" / player side in the header; `data-side` */
  activeSide: 'active-side',
  /** "Pass the turn" — human opponent only */
  endTurn: 'end-turn',
  /** "Status" row of the "Game" sidebar tab; `data-status` */
  gameInfoStatus: 'game-info-status',
  saveStatus: 'save-status',
  /**
   * Optional (requested from FE, plan-frontend §5.5): the table top bar. Specs fall back to the nearest common
   * ancestor of `round-indicator`, `advance-phase` and `prototype-badge` when it is absent.
   */
  tableTopBar: 'table-top-bar',
  // hot-seat handoff screen (SWR-004 plan-frontend §5.3): `data-active-side`, `data-round`, `data-version`
  handoffScreen: 'handoff-screen',
  /** h1, receives focus on appearance (OQ-1) */
  handoffTitle: 'handoff-title',
  /** "I am the <side>" — `aria-busy` */
  handoffAccept: 'handoff-accept',
  /** `role="alert"` */
  handoffError: 'handoff-error',
  boardCanvas: 'board-canvas',
  zoomIn: 'zoom-in',
  zoomOut: 'zoom-out',
  zoomFit: 'zoom-fit',
  zoomLevel: 'zoom-level',
  contextPanel: 'context-panel',
  systemPanel: 'system-panel',
  piecePanel: 'piece-panel',
  actionPanel: 'action-panel',
  actionMove: (pieceId: string, to: string) => `action-move-${pieceId}-${to}`,
  eventLog: 'event-log',
  eventLogItem: 'event-log-item',
  sidebarTab: (tab: 'log' | 'objects' | 'game') => `sidebar-tab-${tab}`,
  boardList: 'board-list',
  systemItem: (id: string) => `system-item-${id}`,
  systemItemMove: (id: string) => `system-item-${id}-move`,
  pieceItem: (id: string) => `piece-item-${id}`,
  // SWR-005 core-v1 table (plan-frontend §9 + Worker P1/P2/M additions; verified against core-v1/** components)
  skipToTurn: 'skip-to-turn',
  skipToList: 'skip-to-list',
  /** `data-side`, `data-mine` */
  turnIndicator: 'turn-indicator',
  /** `data-time`, `data-reputation` */
  timeTrack: 'time-track',
  /** `data-rebels`, `data-empire` */
  passedIndicator: 'passed-indicator',
  topBarControls: 'top-bar-controls',
  turnControls: 'turn-controls',
  finishActivation: 'finish-activation',
  passTurn: 'pass-turn',
  passConfirm: 'pass-confirm',
  passConfirmOk: 'pass-confirm-ok',
  passConfirmCancel: 'pass-confirm-cancel',
  /** `data-state` ∈ idle | armed | activation | waiting | over */
  turnPanel: 'turn-panel',
  turnStatus: 'turn-status',
  /** `role=radiogroup` */
  leaderPool: 'leader-pool',
  leaderPoolEmpty: 'leader-pool-empty',
  leaderPoolNoLeaders: 'leader-pool-no-leaders',
  /** `role=radio`, `aria-checked`, `data-owner`, `data-available` */
  leader: (id: string) => `leader-${id}`,
  activationSystemSelect: 'activation-system-select',
  activationConfirm: 'activation-confirm',
  activationError: 'activation-error',
  /** `data-to` */
  movePanel: 'move-panel',
  moveNone: 'move-none',
  moveSource: (from: string) => `move-source-${from}`,
  /** the checkbox `<input>` */
  movePiece: (id: string) => `move-piece-${id}`,
  moveSelectAll: (from: string) => `move-select-all-${from}`,
  moveSubmit: (from: string) => `move-submit-${from}`,
  moveError: (from: string) => `move-error-${from}`,
  /** `data-required`, `data-capacity`, `data-fits` */
  moveCapacity: (from: string) => `move-capacity-${from}`,
  systemItemActivate: (id: string) => `system-item-${id}-activate`,
  /** `data-owner`, `data-location` */
  leaderItem: (id: string) => `leader-item-${id}`,
  regionGroup: (id: string) => `region-group-${id}`,
  poolGroup: (side: 'rebels' | 'empire') => `pool-group-${side}`,
  /** `data-count` */
  hiddenBaseZone: 'hidden-base-zone',
  hiddenZonePanel: 'hidden-zone-panel',
  coreSidebar: 'core-sidebar',
  coreContextPanel: 'core-context-panel',
  /** `data-system-id` */
  coreSystemPanel: 'system-panel',
  systemPanelActivate: 'system-panel-activate',
  systemPanelContested: 'system-panel-contested',
  systemPanelNotTarget: 'system-panel-not-target',
  /** `data-leader-id` */
  leaderPanel: 'leader-panel',
  /** `data-unit-id` */
  unitPanel: 'unit-panel',
  /** `data-winner`, `data-reason` */
  gameOverBanner: 'game-over-banner',
  gameOverTitle: 'game-over-title',
  gameOverReason: 'game-over-reason',
  gameOverBack: 'game-over-back',
  sessionStatusCompleted: 'session-status-completed',
  /** `data-seq`, `data-type`, `data-actor`, `data-auto` */
  logEntry: (seq: number) => `log-entry-${seq}`,
  logEntryAuto: (seq: number) => `log-entry-${seq}-auto`,
  logEntryAutoHint: (seq: number) => `log-entry-${seq}-auto-hint`,
  mapLegend: 'map-legend',
  gameInfo: 'game-info',
  /** hidden machine-readable mirror of the map (Worker M, accepted test hook, Q-37) */
  coreMapState: 'core-map-state',
  /** `data-region|data-remote|data-contested|data-target|data-source|data-activated|data-rebel-base` */
  mapSystem: (id: string) => `map-system-${id}`,
  mapHiddenZone: 'map-hidden-zone',
  // shared
  notFound: 'not-found',
  feedback: 'feedback',
  liveRegion: 'live-region',
  // settings
  settingsLanguage: (l: 'ru' | 'en') => `settings-language-${l}`,
  settingsReduceMotion: 'settings-reduce-motion',
} as const;

/**
 * `context-panel[data-state]` values. ASSUMPTION (test-cases.md Q-3): plan-frontend does not enumerate them yet;
 * adjust here only if FE fixes different names.
 */
export const CONTEXT_STATE = { empty: 'empty', system: 'system', piece: 'piece' } as const;

/** Prefix of the recent-session items on the game page (`recent-session-<sessionId>`). */
export const RECENT_SESSION_PREFIX = 'recent-session-';

/** SWR-004 row parts share the prefix (`recent-session-faction` …) and must not be counted as items. */
export const RECENT_SESSION_PARTS = [
  'faction',
  'opponent',
  'progress',
  'status',
  'date',
  // SWR-005 describeSession parts: `engine` «Старый прототип» (mock-v1), `outcome` «Победа …» (completed core-v1)
  'engine',
  'outcome',
] as const;

/** CSS selector of recent-session items only (`recent-session-<sessionId>`, without the SWR-004 row parts). */
export const RECENT_SESSION_ITEM =
  `[data-testid^="${RECENT_SESSION_PREFIX}"]` +
  RECENT_SESSION_PARTS.map((p) => `:not([data-testid="${RECENT_SESSION_PREFIX}${p}"])`).join('');

export const byId = (page: Page, id: string) => page.getByTestId(id);

export const CYRILLIC = /[А-Яа-яЁё]/;
