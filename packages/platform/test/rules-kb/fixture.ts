// Minimal valid knowledge base of a fictional game `star-forge` (AC-2): 2 sources (one page excluded),
// entries of every kind, coverage and 2 discrepancies. Negative tests mutate a fresh copy of it.
import {
  parseKnowledgeBase,
  type KbCoverageInput,
  type KbDiscrepancyInput,
  type KbEntryInput,
  type KbManifestInput,
  type KnowledgeBase,
  type KnowledgeBaseIo,
} from '../../src/rules-kb';

export interface FixtureInput {
  manifest: KbManifestInput;
  entries: KbEntryInput[];
  coverage: KbCoverageInput;
  discrepancies: KbDiscrepancyInput[];
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

export function fixtureInput(): FixtureInput {
  return {
    manifest: {
      formatVersion: 1,
      gameId: 'star-forge',
      title: 'Star Forge',
      language: 'en',
      products: ['core'],
      excludedProducts: ['nebula-expansion'],
      categories: [
        { id: 'setup', title: 'Setup' },
        { id: 'turn', title: 'Turn' },
        { id: 'build', title: 'Building', parent: 'turn' },
        { id: 'combat', title: 'Combat' },
        { id: 'victory', title: 'Victory' },
      ],
      sources: [
        {
          id: 'SFR',
          kind: 'rules',
          title: 'Star Forge Rulebook',
          publisher: 'Example Games',
          url: 'https://example.com/star-forge/rules.pdf',
          version: '1.0',
          date: '2020-01-01',
          retrievedAt: '2026-11-20',
          sha256: SHA_A,
          pages: 12,
          precedence: 1,
          status: 'current',
        },
        {
          id: 'SFQ',
          kind: 'faq',
          title: 'Star Forge FAQ',
          publisher: 'Example Games',
          url: 'https://example.com/star-forge/faq.pdf',
          version: '1.1',
          date: '2021-06-01',
          retrievedAt: '2026-11-20',
          sha256: SHA_B,
          pages: 4,
          precedence: 0,
          status: 'current',
          mirror: {
            url: 'https://mirror.example.org/faq.pdf',
            sha256: SHA_B,
            reason: 'publisher CDN unavailable',
          },
          excludedPages: [4],
          notes: 'Page 4 covers the Nebula expansion.',
        },
      ],
      sourceSections: [
        { sourceId: 'SFR', page: 2, title: 'Setup' },
        { sourceId: 'SFR', page: 3, title: 'Turn order' },
        { sourceId: 'SFR', page: 4, title: 'Building forges' },
        { sourceId: 'SFR', page: 7, title: 'Combat' },
        { sourceId: 'SFR', page: 10, title: 'Victory' },
        {
          sourceId: 'SFR',
          page: 12,
          title: 'Team variant',
          coveredBy: 'skip',
          reason: 'Team play is out of scope.',
        },
        { sourceId: 'SFQ', page: 2, title: 'Errata' },
      ],
    },
    entries: [
      {
        id: 'star-forge:setup.board',
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'setup',
        title: 'Board setup',
        text: 'Each player places a home station on a corner sector of the board before the first round.',
        sources: [{ sourceId: 'SFR', page: 2, section: 'Setup' }],
        appliesTo: { phases: ['setup'] },
      },
      {
        id: 'star-forge:turn.order',
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'turn',
        title: 'Turn order',
        text: 'Players take turns clockwise; the player with the fewest stations goes first each round.',
        sources: [
          {
            sourceId: 'SFR',
            page: 3,
            section: 'Turn order',
            quote: 'The player with the fewest stations takes the first turn.',
          },
        ],
        ai: 'core',
        appliesTo: { phases: ['action'] },
        keywords: ['first player', 'очерёдность'],
      },
      {
        id: 'star-forge:build.place-forge',
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'build',
        title: 'Placing a forge',
        text: 'A forge may be built in a sector that contains one of your ships and no enemy ships.',
        sources: [{ sourceId: 'SFR', page: 4, section: 'Building forges' }],
        exceptions: [
          {
            text: 'Asteroid sectors never hold a forge.',
            ruleIds: ['star-forge:turn.order'],
            sources: [{ sourceId: 'SFR', page: 5, section: 'Asteroids' }],
          },
        ],
        related: ['star-forge:turn.order'],
        appliesTo: { commands: ['BUILD_FORGE'] },
        keywords: ['construction', 'строительство'],
      },
      {
        id: 'star-forge:combat.resolve',
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'combat',
        title: 'Resolving combat',
        text: 'The attacker rolls one die per ship; each hit destroys one defending ship.',
        sources: [{ sourceId: 'SFR', page: 7, section: 'Combat' }],
        appliesTo: { commands: ['ATTACK'], sides: ['raiders'] },
      },
      {
        id: 'star-forge:victory.score',
        kind: 'rule',
        status: 'verified',
        product: 'core',
        category: 'victory',
        title: 'Winning the game',
        text: 'The first player to control five forges wins immediately.',
        sources: [{ sourceId: 'SFR', page: 10, section: 'Victory' }],
        ai: 'core',
      },
      {
        id: 'star-forge:build.place-forge-errata',
        kind: 'clarification',
        status: 'verified',
        product: 'core',
        category: 'build',
        title: 'Forge errata',
        text: 'Errata: a forge may also be built in a sector with a friendly station and no ships.',
        sources: [{ sourceId: 'SFQ', page: 2, section: 'Errata' }],
        amends: ['star-forge:build.place-forge'],
        appliesTo: { commands: ['BUILD_FORGE'] },
      },
      {
        id: 'star-forge:turn.pass-timing',
        kind: 'interpretation',
        status: 'needs-review',
        product: 'core',
        category: 'turn',
        title: 'Passing mid-turn',
        text: 'A player who has started building cannot pass until the build is finished.',
        sources: [{ sourceId: 'SFR', page: 3, section: 'Turn order' }],
        rationale:
          'The rulebook says a turn is one complete action; a started build is that action.',
        appliesTo: { phases: ['action'] },
      },
      {
        id: 'star-forge:combat.engine-gap',
        kind: 'implementation-note',
        status: 'verified',
        product: 'core',
        category: 'combat',
        title: 'Combat not implemented',
        text: 'The engine does not resolve combat yet; ATTACK is never a legal action.',
        sources: [{ sourceId: 'SFR', page: 7, section: 'Combat' }],
        ai: 'none',
        discrepancyIds: ['DISC-001'],
      },
    ],
    coverage: {
      engine: 'forge-v1',
      items: [
        {
          ruleId: 'star-forge:setup.board',
          status: 'not-applicable',
          note: 'Setup is fixed by the scenario.',
        },
        {
          ruleId: 'star-forge:turn.order',
          status: 'implemented',
          implementation: [{ path: 'games/star-forge/src/turn.ts', symbol: 'nextPlayer' }],
          tests: [{ path: 'games/star-forge/test/turn.test.ts', name: 'fewest stations first' }],
        },
        {
          ruleId: 'star-forge:build.place-forge',
          status: 'partial',
          implementation: [{ path: 'games/star-forge/src/build.ts', symbol: 'placeForge' }],
          tests: [{ path: 'games/star-forge/test/build.test.ts', name: 'places a forge' }],
          discrepancyIds: ['DISC-002'],
        },
        {
          ruleId: 'star-forge:combat.resolve',
          status: 'not-implemented',
          discrepancyIds: ['DISC-001'],
        },
        {
          ruleId: 'star-forge:victory.score',
          status: 'implemented',
          implementation: [{ path: 'games/star-forge/src/turn.ts', symbol: 'checkVictory' }],
          tests: [{ path: 'games/star-forge/test/turn.test.ts', name: 'five forges win' }],
        },
      ],
    },
    discrepancies: [
      {
        id: 'DISC-001',
        title: 'No combat',
        kind: 'missing-mechanic',
        severity: 'high',
        ruleIds: ['star-forge:combat.resolve'],
        engineBehaviour: 'Ships never fight.',
        officialBehaviour: 'Combat is resolved with dice.',
        decision: 'fix-later',
        followUp: 'Implement combat in forge-v2.',
        refs: ['star-forge:combat.engine-gap', { sourceId: 'SFR', page: 7 }],
      },
      {
        id: 'DISC-002',
        title: 'Asteroid exception ignored',
        kind: 'intentional-deviation',
        severity: 'low',
        ruleIds: ['star-forge:build.place-forge'],
        engineBehaviour: 'Forges may be placed on asteroids.',
        officialBehaviour: 'Asteroid sectors never hold a forge.',
        decision: 'accepted-for-slice',
        followUp: 'Add asteroid terrain.',
      },
    ],
  };
}

export function fixtureKb(): KnowledgeBase {
  return parseKnowledgeBase(fixtureInput());
}

/** In-memory file system of the fixture's coverage evidence. */
export const FIXTURE_FILES: Readonly<Record<string, string>> = {
  'games/star-forge/src/turn.ts':
    'export function nextPlayer() {}\nexport const checkVictory = () => false;\n',
  'games/star-forge/src/build.ts': 'export function placeForge() {}\n',
  'games/star-forge/test/turn.test.ts':
    "it('fewest stations first', () => {});\nit('five forges win', () => {});\n",
  'games/star-forge/test/build.test.ts': "it('places a forge', () => {});\n",
};

export function memoryIo(files: Readonly<Record<string, string>> = FIXTURE_FILES): KnowledgeBaseIo {
  return {
    fileExists: (path) => Object.prototype.hasOwnProperty.call(files, path),
    readText: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`no such file: ${path}`);
      return text;
    },
  };
}
