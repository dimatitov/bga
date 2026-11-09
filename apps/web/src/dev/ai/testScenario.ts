import { type DevAiScenario } from './api';

/**
 * Default scenario of the diagnostics page: the PO test scenario verbatim (specification «PO test scenario»,
 * Q-FE-2). Test data for the model, NOT Rebellion rules (A-1): imports nothing from game packages.
 */
export const DEV_AI_TEST_SCENARIO: DevAiScenario = {
  faction: 'empire',
  phase: 'command',
  objective: 'Strengthen imperial control',
  availableActions: [
    { id: 'action-1', type: 'MOVE_FLEET', target: 'corellia' },
    { id: 'action-2', type: 'RECRUIT', target: 'coruscant' },
    { id: 'action-3', type: 'PASS' },
  ],
};
