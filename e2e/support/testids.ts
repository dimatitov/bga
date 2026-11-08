// data-testid catalogue from plan-frontend.md §6.1 (R-10). Language-independent selectors only.
import { type Page } from '@playwright/test';

export const T = {
  // menu
  menuNewGame: 'menu-new-game',
  menuContinue: 'menu-continue',
  menuSettings: 'menu-settings',
  recentGames: 'recent-games',
  recentGame: (gameId: string) => `recent-game-${gameId}`,
  // new game
  setupFaction: (f: 'empire' | 'rebellion') => `setup-faction-${f}`,
  setupOpponent: (k: 'ai' | 'human') => `setup-opponent-${k}`,
  setupDifficulty: 'setup-difficulty',
  setupDifficultyOption: (d: 'easy' | 'normal' | 'hard') => `setup-difficulty-${d}`,
  setupStart: 'setup-start',
  setupError: 'setup-error',
  // table
  gameTable: 'game-table',
  roundIndicator: 'round-indicator',
  phaseIndicator: 'phase-indicator',
  advancePhase: 'advance-phase',
  mockBadge: 'mock-badge',
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
  gameNotFound: 'game-not-found',
  // shared
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

export const byId = (page: Page, id: string) => page.getByTestId(id);

export const CYRILLIC = /[А-Яа-яЁё]/;
