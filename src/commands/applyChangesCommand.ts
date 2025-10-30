import { FileOperation } from '../types/global';

export interface ApplyChangesParams {
  operations: FileOperation[];
  addLog: (
    message: string | { message: string; onClick: () => Promise<void> }
  ) => void;
  setOperations: (ops: FileOperation[]) => void;
  clearOperations: () => void;
  setActiveTab?: (tab: 'workbench' | 'viewer' | 'review') => void;
}

export async function executeApplyChangesCommand({
  operations,
  addLog,
  setOperations,
  clearOperations,
  setActiveTab,
}: ApplyChangesParams): Promise<boolean> {
  addLog(`Processing ${operations.length} file operations...`);

  try {
    if (operations.length > 0) {
      clearOperations();
      setOperations(operations);
      if (setActiveTab) {
        setActiveTab('review');
      }
      addLog(`Staged ${operations.length} file operations for review.`);
      return true;
    } else {
      addLog('No valid file operations found to apply.');
      return false;
    }
  } catch (error) {
    console.error('Error executing apply changes command:', error);
    addLog(
      error instanceof Error
        ? error.message
        : 'Failed to execute apply changes command'
    );
    return false;
  }
}
