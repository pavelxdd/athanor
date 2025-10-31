import { FileItem } from '../utils/fileTree';
import { buildDynamicPrompt } from '../utils/buildPrompt';
import { TaskData } from '../types/taskTypes';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useContextStore } from '../stores/contextStore';
import { useTaskStore } from '../stores/taskStore';

export interface BuildTaskActionParams {
  task: TaskData;
  rootItems: FileItem[];
  selectedItems: Set<string>;
  addLog: (message: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export async function buildTaskAction(params: BuildTaskActionParams): Promise<void> {
  const {
    task,
    rootItems,
    selectedItems,
    addLog,
    setIsLoading
  } = params;

  if (!rootItems.length) {
    console.warn('No file tree data available');
    return;
  }

  // Check if task requires file selection
  if (task.requires === 'selected' && !selectedItems.size) {
    console.warn('No files selected');
    return;
  }

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

    // Update task description in workbench
    setTabContent(activeTabIndex, processedTaskDescription);
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
