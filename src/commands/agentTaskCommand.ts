import { extractTagContent } from '../utils/extractTagContent';
import { copyToClipboard } from '../actions';
import { useWorkbenchStore } from '../stores/workbenchStore';

export interface AgentTaskCommandParams {
  content: string;
  addLog: (message: string | { message: string; onClick: () => Promise<void> }) => void;
}

export async function executeAgentTaskCommand({
  content,
  addLog,
}: AgentTaskCommandParams): Promise<boolean> {
  try {
    const fileName = extractTagContent(content, 'file_name');
    const taskContent = extractTagContent(content, 'task_content');

    if (!fileName) {
      addLog('Error: "agent task" command is missing <file_name>.');
      return false;
    }

    if (!taskContent) {
      addLog('Error: "agent task" command is missing <task_content>.');
      return false;
    }

    const materialsDir = await window.fileService.getMaterialsDir();
    const filePath = await window.pathUtils.join(materialsDir, fileName);
    const displayPath = await window.pathUtils.relative(filePath);

    await window.fileService.write(filePath, taskContent);

    // Also update the workbench task description
    const workbenchStore = useWorkbenchStore.getState();
    // Create a new tab for the agent task instead of overwriting the current one
    workbenchStore.createTab();
    // The new tab is now active, so resetTaskDescription will apply to it,
    // setting the content and clearing output/context.
    // This preserves the user's original tab/context.
    workbenchStore.resetTaskDescription(taskContent);

    const instruction = `- Read the instructions in ${displayPath}\n- Think about the task and then execute it`;
    addLog({
      message: `Agent task created: ${displayPath}. Click to copy instruction.`,
      onClick: async () => {
        await copyToClipboard({
          content: instruction,
          addLog: (msg: string) => addLog(msg),
        });
      },
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    addLog(`Error executing "agent task" command: ${errorMessage}`);
    console.error('Agent Task execution failed:', error);
    return false;
  }
}
