/** Public API of the game board feature (plan-frontend §1). */
export { BoardStage as BoardView } from './canvas/BoardStage';
export { BoardSidebar } from './sidebar/BoardSidebar';
export { AdvancePhaseButton } from './panels/AdvancePhaseButton';
export {
  BoardContext,
  useBoard,
  type BoardContextValue,
  type CommandOutcome,
  type CommandSender,
} from './model/boardContext';
export { useGlobalEscape } from './hooks/useBoardKeyboard';
export { useSelectionStore } from './model/selectionStore';
export { useDragStore } from './model/dragStore';
export { logMessage } from './sidebar/logMessage';
export { factionName, phaseName } from './model/labels';
