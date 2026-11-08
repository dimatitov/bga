/**
 * The scripted games of SWR-005 W5 on the real base-game data (unit ids `u-01…` follow the start setup:
 * u-02 Rebel transport, u-03 X-wing (Bothawui); u-09…u-14 the units "on the base"; u-40 Star Destroyer,
 * u-41 TIE, u-43 stormtrooper, u-45 AT-ST (Sullust); u-29 Star Destroyer, u-33 stormtrooper (Coruscant)).
 * The session ids are chosen so that `chooseRebelBase` puts the base in Rodia (asserted by the tests).
 */
import {
  EMPIRE_VS_AI,
  HOT_SEAT,
  REBELS_VS_AI,
  accept,
  activate,
  finish,
  move,
  pass,
  play,
  start,
  type Played,
  type Step,
} from './core-script';

export const BASE_SYSTEM = 'rodia';

/** The units on the base at the start (the base is Rodia in every scripted game). */
export const BASE_UNITS = ['u-09', 'u-10', 'u-11', 'u-12', 'u-13', 'u-14'];

// ---------------------------------------------------------------------------------------------------------
// Golden 1 — hot-seat, ≥ 2 rounds, base revealed, Empire wins (TC-G-01, TC-G-02)
// ---------------------------------------------------------------------------------------------------------

export const EMPIRE_WIN_SESSION = 'golden-empire-win-3';

/** Round 1 up to the Rebels' first move inside their activation (reference view `rebels-command`). */
export const EW_R1_REBELS_ACTIVATION: Step[] = [
  // Rebels: Leia activates the (secret) base, the transport comes in from Bothawui.
  activate('rebels', 'leia', 'rodia'),
  move('rebels', ['u-02'], 'bothawui', 'rodia'),
];

/** … → finish (turn to the Empire, hot-seat handoff: reference view `handoff`). */
export const EW_R1_HANDOFF: Step[] = [finish('rebels')];

export const EW_R1_REST: Step[] = [
  accept('empire'),
  // Empire: Vader activates Malastare; Star Destroyer carries TIE + stormtrooper + AT-ST (3 of 6).
  activate('empire', 'vader', 'malastare'),
  move('empire', ['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'),
  finish('empire'),
  accept('rebels'),
  // Rebels: Dodonna activates Malastare too; an X-wing (no transport needed) makes it contested (D-1).
  activate('rebels', 'dodonna', 'malastare'),
  move('rebels', ['u-03'], 'bothawui', 'malastare'),
  finish('rebels'),
  accept('empire'),
  // Empire: Tarkin activates the system where its own leader already stands (R-4); no moves.
  activate('empire', 'tarkin', 'malastare'),
  finish('empire'),
  accept('rebels'),
  // Rebels pass for the rest of the phase (R-6) → the Empire acts on consecutive turns.
  pass('rebels'),
  accept('empire'),
  activate('empire', 'tagge', 'corellia'),
  move('empire', ['u-29', 'u-33'], 'coruscant', 'corellia'),
  finish('empire'),
  // Both passed → refresh: leaders back, time 2, Rebels first (handoff).
  pass('empire'),
  accept('rebels'),
  // Round 2: the Rebels keep their base troops home this turn.
  activate('rebels', 'rieekan', 'toydaria'),
  finish('rebels'),
  accept('empire'),
];
// Here: Empire to move, base hidden (reference view `empire-prereveal`).

export const EW_R2_REVEAL: Step[] = [
  // Empire: Vader activates Rodia, ground units + transport come in; finishing reveals the base (R-8),
  // Rebel units are still there → no victory yet.
  activate('empire', 'vader', 'rodia'),
  move('empire', ['u-40', 'u-43', 'u-45'], 'malastare', 'rodia'),
  finish('empire'),
];
// Here: base revealed (reference view `empire-revealed`), Rebels to accept the handoff.

export const EW_R2_EVACUATE: Step[] = [
  accept('rebels'),
  // Rebels evacuate everything: transport (4) carries 3 troopers + airspeeder; X/Y-wings fly alone.
  activate('rebels', 'leia', 'bothawui'),
  move('rebels', ['u-02', ...BASE_UNITS], 'rodia', 'bothawui'),
];
// The move empties the revealed base held by Imperial units → Empire wins (R-9, `game-over`).

export interface EmpireWinGame {
  rebelsCommand: Played;
  handoff: Played;
  empirePrereveal: Played;
  empireRevealed: Played;
  final: Played;
}

export function playEmpireWin(): EmpireWinGame {
  const created = start(HOT_SEAT, EMPIRE_WIN_SESSION);
  const rebelsCommand = play(created, EW_R1_REBELS_ACTIVATION);
  const handoff = play(rebelsCommand, EW_R1_HANDOFF);
  const empirePrereveal = play(handoff, EW_R1_REST);
  const empireRevealed = play(empirePrereveal, EW_R2_REVEAL);
  const final = play(empireRevealed, EW_R2_EVACUATE);
  return { rebelsCommand, handoff, empirePrereveal, empireRevealed, final };
}

/** All steps of golden 1 in order (for TC-G-04). */
export const EMPIRE_WIN_STEPS: Step[] = [
  ...EW_R1_REBELS_ACTIVATION,
  ...EW_R1_HANDOFF,
  ...EW_R1_REST,
  ...EW_R2_REVEAL,
  ...EW_R2_EVACUATE,
];

// ---------------------------------------------------------------------------------------------------------
// Golden 2 — Rebels vs AI Empire, 13 passes → time 14 = reputation → Rebels win (TC-G-03, TC-AI-08)
// ---------------------------------------------------------------------------------------------------------

export const REBELS_TIME_SESSION = 'golden-rebels-time';

export function playRebelsTimeWin(): { beforeLast: Played; final: Played } {
  const created = start(REBELS_VS_AI, REBELS_TIME_SESSION);
  const beforeLast = play(
    created,
    Array.from({ length: 12 }, () => pass('rebels')),
  );
  const final = play(beforeLast, [pass('rebels')]);
  return { beforeLast, final };
}

// ---------------------------------------------------------------------------------------------------------
// e2e seeds (Q-35): "one activation before the reveal / the win"
// ---------------------------------------------------------------------------------------------------------

/** AI game, player Empire, round 2, Empire to move; Activate Rodia + move from Malastare + finish = reveal. */
export const SEED_REVEAL_SESSION = 'seed-reveal-7';
export const SEED_REVEAL_STEPS: Step[] = [
  activate('empire', 'vader', 'malastare'),
  move('empire', ['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'),
  finish('empire'),
  // The AI Rebels passed at creation: the Empire's pass ends the round; next round they pass again.
  pass('empire'),
];
/** The scenario-4 move (not applied in the seed). */
export const SEED_REVEAL_NEXT: Step[] = [
  activate('empire', 'vader', 'rodia'),
  move('empire', ['u-40', 'u-43', 'u-45'], 'malastare', 'rodia'),
  finish('empire'),
];

export function playSeedReveal(): Played {
  return play(start(EMPIRE_VS_AI, SEED_REVEAL_SESSION), SEED_REVEAL_STEPS);
}

/**
 * Hot-seat (the AI Rebels never leave their base, so an Empire victory needs a human Rebel player): round 2,
 * Empire to move (handoff accepted), the Rebels have evacuated the still-hidden base; Activate Rodia + move
 * from Malastare + finish = reveal and immediate Empire victory.
 */
export const SEED_WIN_SESSION = 'seed-win-1';
export const SEED_WIN_STEPS: Step[] = [
  activate('rebels', 'leia', 'rodia'),
  move('rebels', ['u-02'], 'bothawui', 'rodia'),
  finish('rebels'),
  accept('empire'),
  activate('empire', 'vader', 'malastare'),
  move('empire', ['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'),
  finish('empire'),
  accept('rebels'),
  pass('rebels'),
  accept('empire'),
  pass('empire'),
  accept('rebels'),
  activate('rebels', 'dodonna', 'bothawui'),
  move('rebels', ['u-02', ...BASE_UNITS], 'rodia', 'bothawui'),
  finish('rebels'),
  accept('empire'),
];
/** The scenario-5b move (not applied in the seed). */
export const SEED_WIN_NEXT: Step[] = SEED_REVEAL_NEXT;

export function playSeedWin(): Played {
  return play(start(HOT_SEAT, SEED_WIN_SESSION), SEED_WIN_STEPS);
}
