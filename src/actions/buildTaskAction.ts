import { FileItem } from '../utils/fileTree';
import { buildDynamicPrompt } from '../utils/buildPrompt';
import { TaskData } from '../types/taskTypes';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useContextStore } from '../stores/contextStore';
import { useTaskStore } from '../stores/taskStore';

// Execute git command and replace <git_command> tag with result
async function processGitCommands(content: string): Promise<string> {
  const commandRegex = /<git_command>([\s\S]*?)<\/git_command>/gi;
  const matches = Array.from(content.matchAll(commandRegex));
  
  if (matches.length === 0) {
    return content;
  }

  // Execute all git commands in parallel
  const promises = matches.map(async (match) => {
    const command = match[1].trim();

    try {
      // Remove "git " prefix if present
      const gitCommand = command.startsWith('git ') ? command.substring(4) : command;
      const result = await window.electronBridge.git.executeGitCommand(gitCommand);
      return `\`\`\`diff\n${result}\n\`\`\``;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for common git errors to provide better messages
      if (errorMessage.includes('not a git repository') || errorMessage.includes('Git is not installed')) {
        return `\`\`\`\nError: Not a git repository or Git not installed\nGit commands require the project to be in a git repository.\n\`\`\``;
      }
      
      console.error(`Error executing git command "${command}":`, errorMessage);
      return `\`\`\`\nError executing git command: ${command}\n\n${errorMessage}\n\`\`\``;
    }
  });

  const results = await Promise.all(promises);
  
  // Replace all tags with results in a single pass
  let index = 0;
  return content.replace(commandRegex, () => results[index++]);
}

export interface BuildTaskActionParams {
  task: TaskData;
  rootItems: FileItem[];
  selectedItems: Set<string>;
  addLog: (message: string) => void;
  setIsLoading: (loading: boolean) => void;
  selectionStart?: number;
  selectionEnd?: number;
  insertText?: (text: string, start?: number, end?: number) => void;
}

export async function buildTaskAction(params: BuildTaskActionParams): Promise<void> {
  const {
    task,
    rootItems,
    selectedItems,
    addLog,
    setIsLoading,
    selectionStart,
    selectionEnd,
    insertText
  } = params;

  
  if (!rootItems.length) {
    console.warn('No file tree data available');
    return;
  }

  // Check if task requirements are met
  if (task.requires === 'selected' && !selectedItems.size) {
    console.warn(`Cannot build task "${task.label}": No files selected`);
    return;
  }
  // Note: git requirement is already checked in UI (ActionPanel), and will be handled in processGitCommands if needed

  // Get workbench store methods for state management
  const { tabs, activeTabIndex, setIsGeneratingPrompt, resetGeneratingPrompt, setTabContent } = useWorkbenchStore.getState();

  setIsLoading(true);
  setIsGeneratingPrompt(true); // Set global loading state
  try {
    // Get current directory for path resolution
    const currentDir = await window.fileSystem.getCurrentDirectory();

    // Get the active or default variant from the task store
    const { getDefaultVariant } = useTaskStore.getState();
    const variant = getDefaultVariant(task.id);
    if (!variant) {
      throw new Error(`No variant found for task ${task.id}`);
    }

    // Get current active tab
    const activeTab = tabs[activeTabIndex];
    if (!activeTab) {
      throw new Error('No active tab found');
    }

    // Build prompt with task content
    const processedTaskDescription = await buildDynamicPrompt(
      task,
      variant,
      rootItems,
      Array.from(selectedItems), // Convert Set to array for buildDynamicPrompt
      [], // neighboringFiles
      currentDir,
      activeTab.content,
      activeTab.context,
      activeTab.name,
      undefined // passedFormatTypeOverride
    );

    // Process any <git_command> tags in the generated content
    const finalContent = await processGitCommands(processedTaskDescription);

    // Insert text using custom undo support if available
    if (insertText) {
      insertText(finalContent, selectionStart, selectionEnd);
    } else {
      // Fallback to direct state update
      setTabContent(activeTabIndex, finalContent, selectionStart, selectionEnd);
    }
    addLog(`${task.label} task prompt loaded and processed`);

    // No longer triggering developer action automatically from here
  } catch (error) {
    console.error(`Error processing ${task.label} task:`, error);
    addLog(`Failed to process ${task.label} task`);
    // Ensure state is reset on error
    resetGeneratingPrompt();
  } finally {
    setIsLoading(false);
    setIsGeneratingPrompt(false); // Reset global loading state
  }
}
