import type { FileOperation } from '../types/global';
import * as commands from '../commands';

/**
 * Process AI response content for commands, independent of clipboard
 *
 * @param aiContent - The AI response content to process
 * @param params - Parameters for command execution
 */
export async function processAiResponseContent(
  aiContent: string,
  params: {
    addLog: (message: string | { message: string; onClick: () => Promise<void> }) => void;
    setOperations: (ops: FileOperation[]) => void;
    clearOperations: () => void;
    setActiveTab?: (tab: 'workbench' | 'viewer' | 'review') => void;
  }
): Promise<void> {
  const { addLog, setOperations, clearOperations, setActiveTab } = params;

  try {
    const parsedCommands = await commands.parseCommand(aiContent);

    if (!parsedCommands || parsedCommands.length === 0) {
      addLog('No valid commands found in AI response');
      return;
    }

    // Aggregate all file operations from multiple 'apply changes' commands
    const allOperations: FileOperation[] = [];
    const otherCommands = [];

    for (const cmd of parsedCommands) {
      if (cmd.type === commands.COMMAND_TYPES.APPLY_CHANGES && Array.isArray(cmd.content)) {
        allOperations.push(...cmd.content);
      } else {
        otherCommands.push(cmd);
      }
    }

    // Process the single aggregated 'apply changes' command
    if (allOperations.length > 0) {
      const success = await commands.executeApplyChangesCommand({
        operations: allOperations,
        addLog,
        setOperations,
        clearOperations,
        setActiveTab,
      });

      if (!success) {
        addLog('Failed to execute combined APPLY_CHANGES command');
      }
    }

    // Process all other commands sequentially
    for (const command of otherCommands) {
      let success = false;

      // Ensure content is a string for these commands
      if (typeof command.content !== 'string') {
        addLog(`Invalid content type for ${command.type} command.`);
        continue;
      }

      switch (command.type) {
        case commands.COMMAND_TYPES.SELECT:
          success = await commands.executeSelectCommand({
            content: command.content,
            addLog,
          });
          break;

        case commands.COMMAND_TYPES.TASK:
          success = await commands.executeTaskCommand({
            content: command.content,
            addLog,
          });
          break;

        case commands.COMMAND_TYPES.AGENT_TASK:
          success = await commands.executeAgentTaskCommand({
            content: command.content,
            addLog,
          });
          break;

        // APPLY_CHANGES is handled above, so we can ignore it here
        case commands.COMMAND_TYPES.APPLY_CHANGES:
          break;

        default:
          addLog(`Unknown command type: ${String(command.type)}`);
          continue;
      }

      if (!success && command.type !== commands.COMMAND_TYPES.APPLY_CHANGES) {
        addLog(`Failed to execute ${command.type} command`);
      }
    }
  } catch (err) {
    console.error('Failed to process AI content:', err);
    addLog(`Failed to process AI content: ${err instanceof Error ? err.message : String(err)}`);
  }
}
