/** Game-agnostic automation host of SessionHost (SWR-006 plan-frontend §3–§4). */
export { AutomationNotice } from './AutomationNotice';
export {
  type AutomationLastRun,
  type AutomationPhase,
  type AutomationSource,
  resetAutomationStore,
} from './automationStore';
export { commitCommandResult } from './commitCommandResult';
export { automationFallbackReasonText } from './fallbackReason';
export { resetAutomationRuns, runAutomation } from './runAutomation';
export {
  SessionAutomationContext,
  type SessionAutomationState,
  useSessionAutomation,
} from './SessionAutomationContext';
export { useAutomationDriver } from './useAutomationDriver';
