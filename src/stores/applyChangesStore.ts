import { create } from 'zustand';
import { useLogStore } from './logStore';
import { FileOperation, FileOperationType } from '../types/global';

interface ApplyChangesState {
  activeOperations: FileOperation[];
  mode: 'ai' | 'git';
  setOperations: (ops: FileOperation[], mode?: 'ai' | 'git') => void;
  clearOperations: () => void;
  applyChange: (
    index: number,
    options?: { skipRefresh?: boolean }
  ) => Promise<void>;
  rejectChange: (
    index: number,
    options?: { skipRefresh?: boolean }
  ) => Promise<void>;
  applyAllChanges: () => Promise<void>;
  rejectAllChanges: () => Promise<void>;
  setChangeAppliedCallback: (
    callback: ((newlyCreatedPath?: string) => Promise<void>) | null
  ) => void;
  diffMode: 'strict' | 'fuzzy';
  setDiffMode: (mode: 'strict' | 'fuzzy') => void;
}

export const useApplyChangesStore = create<ApplyChangesState>((set, get) => {
  let onChangeApplied:
    | ((newlyCreatedPath?: string) => Promise<void>)
    | null = null;

  return {
    activeOperations: [],
    diffMode: 'strict', // Default to strict mode for more accurate changes
    mode: 'ai', // Default to AI mode

    setOperations: (ops: FileOperation[], mode: 'ai' | 'git' = 'ai') => {
      set({ activeOperations: ops, mode });
    },

    clearOperations: () => {
      set({ activeOperations: [] });
    },

    setChangeAppliedCallback: (
      callback: ((newlyCreatedPath?: string) => Promise<void>) | null
    ) => {
      onChangeApplied = callback;
    },

    setDiffMode: (mode: 'strict' | 'fuzzy') => {
      set({ diffMode: mode });
    },

    applyChange: async (index: number, options?: { skipRefresh?: boolean }) => {
      const { activeOperations } = get();
      if (index < 0 || index >= activeOperations.length) return;

      const op = activeOperations[index];
      // If it's already accepted or rejected, do nothing
      if (op.accepted || op.rejected) {
        return;
      }

      const { addLog } = useLogStore.getState();
      try {
        // First mark as accepted to prevent duplicate operations
        const newOps = [...activeOperations];
        newOps[index] = { ...op, accepted: true };
        set({ activeOperations: newOps });

        // Normalize file path to use forward slashes
        const normalizedPath = op.file_path.replace(/\\/g, '/');
        // Remove leading slash if present to make path relative
        const relativePath = normalizedPath.startsWith('/')
          ? normalizedPath.slice(1)
          : normalizedPath;

        // Perform the file system operation
        switch (op.file_operation) {
          case 'CREATE':
          case 'UPDATE_FULL':
          case 'UPDATE_DIFF':
            try {
              await window.fileService.write(relativePath, op.new_code);
              const operationVerb =
                op.file_operation === 'CREATE'
                  ? 'Created'
                  : op.file_operation === 'UPDATE_FULL'
                    ? 'Updated'
                    : 'Applied changes to';
              addLog(`${operationVerb} file: ${relativePath}`);

              // Additional validation for UPDATE_DIFF
              if (op.file_operation === 'UPDATE_DIFF') {
                try {
                  const newContent = await window.fileService.read(
                    relativePath,
                    { encoding: 'utf8' }
                  );
                  if (newContent !== op.new_code) {
                    throw new Error(
                      'File content verification failed after diff update'
                    );
                  }
                } catch (error) {
                  console.error('Verification error:', error);
                  addLog(
                    `Warning: Could not verify file content after update: ${error}`
                  );
                }
              }
            } catch (error) {
              // If operation fails, mark as not accepted and propagate error
              newOps[index] = { ...op, accepted: false };
              set({ activeOperations: newOps });
              throw error;
            }
            break;

          case 'DELETE':
            try {
              await window.fileService.remove(relativePath);
              addLog(`Deleted file: ${relativePath}`);
            } catch (error) {
              // If operation fails, mark as not accepted and propagate error
              newOps[index] = { ...op, accepted: false };
              set({ activeOperations: newOps });
              throw error;
            }
            break;

          default:
            addLog(`Unknown operation: ${op.file_operation}`);
            // Mark operation as not accepted for unknown types
            newOps[index] = { ...op, accepted: false };
            set({ activeOperations: newOps });
            throw new Error(`Unsupported operation type: ${op.file_operation}`);
        }

        // Call the refresh callback after successful operation
        if (onChangeApplied && !options?.skipRefresh) {
          try {
            // For CREATE operations, pass the file path to the callback
            if (op.file_operation === 'CREATE') {
              await onChangeApplied(relativePath);
            } else {
              await onChangeApplied();
            }
          } catch (error) {
            console.error('Error in change applied callback:', error);
            addLog('Warning: Post-operation refresh failed');
          }
        }
      } catch (error) {
        console.error(`Error applying change to ${op.file_path}:`, error);
        addLog(
          `Failed to ${op.file_operation.toLowerCase()} file ${
            op.file_path
          }: ${error}`
        );
        throw error; // Re-throw to let UI handle the error
      }
    },

    rejectChange: async (
      index: number,
      options?: { skipRefresh?: boolean }
    ) => {
      const { activeOperations, mode } = get();
      if (index < 0 || index >= activeOperations.length) return;

      const op = activeOperations[index];
      if (op.accepted || op.rejected) {
        return;
      }
      const { addLog } = useLogStore.getState();

      if (mode === 'git') {
        // GIT MODE: Revert the file
        let changeApplied = false;
        try {
          if (op.file_operation === 'CREATE') {
            // Reverting a new file means deleting it
            await window.fileService.remove(op.file_path);
            addLog(`Reverted (deleted) new file: ${op.file_path}`);
            changeApplied = true;
          } else {
            // Reverting a modified or deleted file means writing the old content back
            await window.fileService.write(op.file_path, op.old_code);
            addLog(`Reverted changes to file: ${op.file_path}`);
            changeApplied = true;
          }
          // Mark as rejected in the UI
          const newOps = [...activeOperations];
          newOps[index] = { ...op, rejected: true };
          set({ activeOperations: newOps });

          if (changeApplied && onChangeApplied && !options?.skipRefresh) {
            await onChangeApplied();
          }
        } catch (error) {
          if (error instanceof Error) {
            addLog(`Failed to revert ${op.file_path}: ${error.message}`);
          } else {
            addLog(
              `An unknown error occurred while reverting ${op.file_path}: ${String(
                error
              )}`
            );
          }
        }
      } else {
        // AI MODE: Original logic
        const newOps = [...activeOperations];
        newOps[index] = { ...op, rejected: true };
        set({ activeOperations: newOps });
        addLog(`Rejected operation for file: ${op.file_path}`);
      }
    },

    rejectAllChanges: async () => {
      const { activeOperations, rejectChange, mode } = get();
      const { addLog } = useLogStore.getState();
      addLog('Rejecting all pending changes...');
      let changesMade = false;
      for (let i = 0; i < activeOperations.length; i++) {
        const op = activeOperations[i];
        if (!op.accepted && !op.rejected) {
          await rejectChange(i, { skipRefresh: true });
          // A change to the filesystem only happens in git mode
          if (mode === 'git') {
            changesMade = true;
          }
        }
      }

      // If in git mode and changes were made, refresh the file system once.
      if (mode === 'git' && changesMade && onChangeApplied) {
        await onChangeApplied();
      }
    },

    applyAllChanges: async () => {
      const { activeOperations, applyChange } = get();
      const { addLog } = useLogStore.getState();
      addLog('Applying all pending changes...');
      let changesMade = false;
      // Use a classic for loop to get index and process sequentially with await
      for (let i = 0; i < activeOperations.length; i++) {
        const op = activeOperations[i];
        if (!op.accepted && !op.rejected) {
          try {
            // Await each change to process them one by one, skipping refresh
            await applyChange(i, { skipRefresh: true });
            changesMade = true;
          } catch (error) {
            addLog(
              `Error applying all changes. Process stopped at file: ${op.file_path}.`
            );
            // If some changes were made before the error, refresh the file system
            if (changesMade && onChangeApplied) {
              await onChangeApplied();
            }
            return; // Stop processing on first error
          }
        }
      }

      // After all operations are done, trigger a single refresh
      if (changesMade) {
        if (onChangeApplied) {
          try {
            await onChangeApplied();
          } catch (error) {
            console.error('Error in final refresh callback:', error);
            addLog('Warning: Final post-operation refresh failed');
          }
        }
        addLog('Finished applying all available changes.');
      } else {
        addLog('No pending changes to apply.');
      }
    },
  };
});
