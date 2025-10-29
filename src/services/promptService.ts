import { PromptData, PromptVariant, DEFAULT_PROMPT_ORDER } from '../types/promptTypes';
import { TaskData, TaskVariant, DEFAULT_TASK_ORDER } from '../types/taskTypes';
import { usePromptStore } from '../stores/promptStore';
import { useTaskStore } from '../stores/taskStore';
import { readFileContent } from './fileSystemService';
import { CUSTOM_TEMPLATES } from '../utils/constants';

// Regular expressions for parsing XML files
const XML_TAG_REGEX = /<ath_(\w+)\s+([^>]+)>/;
const VARIANT_TAG_REGEX =
  /<ath_\w+_variant\s+([^>]+)>([\s\S]*?)<\/ath_\w+_variant>/g;
const ATTRIBUTES_REGEX = /(\w+)="([^"]*?)"/g;

// Parse attributes from an XML tag string
function parseAttributes(attributesStr: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let match;
  while ((match = ATTRIBUTES_REGEX.exec(attributesStr)) !== null) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

// Generic function to parse both prompt and task files
async function parseXmlFile<T extends PromptData | TaskData>(
  filePath: string,
  type: 'prompt' | 'task',
  source: 'default' | 'global' | 'project'
): Promise<T | null> {
  try {
    const content = await readFileContent(filePath);

    // Parse main tag attributes
    const tagMatch = XML_TAG_REGEX.exec(content);
    if (!tagMatch || !tagMatch[2] || tagMatch[1] !== type) {
      console.warn(`No valid ath_${type} tag found in ${filePath}`);
      return null;
    }

    const attrs = parseAttributes(tagMatch[2]);
    if (!attrs.id || !attrs.label) {
      console.warn(`Missing required attributes (id/label) in ${filePath}`);
      return null;
    }

    // Parse order attribute with default fallback
    const order = attrs.order
      ? parseInt(attrs.order, 10)
      : type === 'prompt'
      ? DEFAULT_PROMPT_ORDER
      : DEFAULT_TASK_ORDER;

    // Validate order is a valid number
    if (isNaN(order)) {
      console.warn(`Invalid order value in ${filePath}, using default`);
    }

    // Parse variants
    const variants: (PromptVariant | TaskVariant)[] = [];
    let variantMatch;
    while ((variantMatch = VARIANT_TAG_REGEX.exec(content)) !== null) {
      const variantAttrs = parseAttributes(variantMatch[1]);
      if (!variantAttrs.id || !variantAttrs.label) continue;

      variants.push({
        id: variantAttrs.id,
        label: variantAttrs.label,
        tooltip: variantAttrs.tooltip,
        content: variantMatch[2].trim(),
      });
    }

    if (variants.length === 0) {
      console.warn(`No valid variants found in ${filePath}`);
      return null;
    }

    // Construct the data object
    const data: T = {
      id: attrs.id,
      label: attrs.label,
      icon: attrs.icon,
      tooltip: attrs.tooltip,
      order: order,
      variants: variants,
      source: source,
    } as T;

    // Add task-specific fields
    if (type === 'task' && attrs.requires) {
      (data as TaskData).requires = attrs.requires as 'selected';
    }

    return data;
  } catch (error) {
    console.error(`Error parsing ${type} file ${filePath}:`, error);
    return null;
  }
}

// Load all prompts and update the store
export async function loadPrompts(): Promise<void> {
  try {
    // Initialize arrays for prompts from each source
    let defaultPromptsData: (PromptData | null)[] = [];
    let globalPromptsData: (PromptData | null)[] = [];
    let projectPromptsData: (PromptData | null)[] = [];

    // Load default prompts from resources
    const resourcesPath = await window.fileSystem.getResourcesPath();
    const promptsDir = await window.fileSystem.joinPaths(resourcesPath, 'prompts');
    const files = await window.fileSystem.readDirectory(promptsDir, false);

    // Parse default prompt files (starting with 'prompt_' and ending with '.xml') in parallel
    defaultPromptsData = await Promise.all(
      files
        .filter(file => file.startsWith('prompt_') && file.endsWith('.xml'))
        .map(async file => {
          const filePath = await window.fileSystem.joinPaths(promptsDir, file);
          return parseXmlFile<PromptData>(filePath, 'prompt', 'default');
        })
    );

    // Load global user prompts
    try {
      const userDataPath = await window.app.getUserDataPath();
      const globalTemplatesDir = await window.fileSystem.joinPaths(userDataPath, CUSTOM_TEMPLATES.USER_PROMPTS_DIR_NAME);
      
      await window.fileService.ensureDirectory(globalTemplatesDir);
      
      const globalFiles = await window.fileSystem.readDirectory(globalTemplatesDir, false);

      // Parse global prompt files in parallel
      globalPromptsData = await Promise.all(
        globalFiles
          .filter(file => file.startsWith('prompt_') && file.endsWith('.xml'))
          .map(async file => {
            const filePath = await window.fileSystem.joinPaths(globalTemplatesDir, file);
            return parseXmlFile<PromptData>(filePath, 'prompt', 'global');
          })
      );
    } catch (error) {
      console.warn('Error accessing global user templates directory:', error);
    }

    // Load project-specific prompts
    try {
      const materialsDir = await window.fileService.getMaterialsDir();
      const projectTemplatesDir = await window.fileSystem.joinPaths(materialsDir, CUSTOM_TEMPLATES.USER_PROMPTS_DIR_NAME);
      
      await window.fileService.ensureDirectory(projectTemplatesDir);
      
      const projectFiles = await window.fileSystem.readDirectory(projectTemplatesDir, false);

      // Parse project prompt files in parallel
      projectPromptsData = await Promise.all(
        projectFiles
          .filter(file => file.startsWith('prompt_') && file.endsWith('.xml'))
          .map(async file => {
            const filePath = await window.fileSystem.joinPaths(projectTemplatesDir, file);
            return parseXmlFile<PromptData>(filePath, 'prompt', 'project');
          })
      );
    } catch (error) {
      console.warn('Error accessing project templates directory:', error);
    }

    // Filter out null results from failed parsing
    const validDefaultPrompts = defaultPromptsData.filter((p): p is PromptData => p !== null);
    const validGlobalPrompts = globalPromptsData.filter((p): p is PromptData => p !== null);
    const validProjectPrompts = projectPromptsData.filter((p): p is PromptData => p !== null);

    // Implement merging logic with override priority: Default < Global < Project
    const mergedPromptsMap = new Map<number, PromptData>();

    for (const prompt of validDefaultPrompts) mergedPromptsMap.set(prompt.order, prompt);
    for (const prompt of validGlobalPrompts) mergedPromptsMap.set(prompt.order, prompt);
    for (const prompt of validProjectPrompts) mergedPromptsMap.set(prompt.order, prompt);

    const finalMergedPrompts = Array.from(mergedPromptsMap.values());

    console.log(`Loaded ${validDefaultPrompts.length} default, ${validGlobalPrompts.length} global, ${validProjectPrompts.length} project prompts`);
    console.log(`Final merged prompts count: ${finalMergedPrompts.length}`);

    usePromptStore.getState().setPrompts(finalMergedPrompts);
  } catch (error) {
    console.error('Error loading prompts:', error);
    throw error;
  }
}

// Load all tasks and update the store
export async function loadTasks(): Promise<void> {
  try {
    let defaultTasksData: (TaskData | null)[] = [];
    let globalTasksData: (TaskData | null)[] = [];
    let projectTasksData: (TaskData | null)[] = [];

    const resourcesPath = await window.fileSystem.getResourcesPath();
    const promptsDir = await window.fileSystem.joinPaths(resourcesPath, 'prompts');
    const files = await window.fileSystem.readDirectory(promptsDir, false);

    defaultTasksData = await Promise.all(
      files
        .filter(file => file.startsWith('task_') && file.endsWith('.xml'))
        .map(async file => {
          const filePath = await window.fileSystem.joinPaths(promptsDir, file);
          return parseXmlFile<TaskData>(filePath, 'task', 'default');
        })
    );

    try {
      const userDataPath = await window.app.getUserDataPath();
      const globalTemplatesDir = await window.fileSystem.joinPaths(userDataPath, CUSTOM_TEMPLATES.USER_PROMPTS_DIR_NAME);
      
      await window.fileService.ensureDirectory(globalTemplatesDir);
      
      const globalFiles = await window.fileSystem.readDirectory(globalTemplatesDir, false);

      globalTasksData = await Promise.all(
        globalFiles
          .filter(file => file.startsWith('task_') && file.endsWith('.xml'))
          .map(async file => {
            const filePath = await window.fileSystem.joinPaths(globalTemplatesDir, file);
            return parseXmlFile<TaskData>(filePath, 'task', 'global');
          })
      );
    } catch (error) {
      console.warn('Error accessing global user tasks directory:', error);
    }

    try {
      const materialsDir = await window.fileService.getMaterialsDir();
      const projectTemplatesDir = await window.fileSystem.joinPaths(materialsDir, CUSTOM_TEMPLATES.USER_PROMPTS_DIR_NAME);
      
      await window.fileService.ensureDirectory(projectTemplatesDir);
      
      const projectFiles = await window.fileSystem.readDirectory(projectTemplatesDir, false);

      projectTasksData = await Promise.all(
        projectFiles
          .filter(file => file.startsWith('task_') && file.endsWith('.xml'))
          .map(async file => {
            const filePath = await window.fileSystem.joinPaths(projectTemplatesDir, file);
            return parseXmlFile<TaskData>(filePath, 'task', 'project');
          })
      );
    } catch (error) {
      console.warn('Error accessing project tasks directory:', error);
    }
    
    const validDefaultTasks = defaultTasksData.filter((t): t is TaskData => t !== null);
    const validGlobalTasks = globalTasksData.filter((t): t is TaskData => t !== null);
    const validProjectTasks = projectTasksData.filter((t): t is TaskData => t !== null);

    const mergedTasksMap = new Map<number, TaskData>();

    for (const task of validDefaultTasks) mergedTasksMap.set(task.order, task);
    for (const task of validGlobalTasks) mergedTasksMap.set(task.order, task);
    for (const task of validProjectTasks) mergedTasksMap.set(task.order, task);

    const finalMergedTasks = Array.from(mergedTasksMap.values());

    console.log(`Loaded ${validDefaultTasks.length} default, ${validGlobalTasks.length} global, ${validProjectTasks.length} project tasks`);
    console.log(`Final merged tasks count: ${finalMergedTasks.length}`);

    useTaskStore.getState().setTasks(finalMergedTasks);
  } catch (error) {
    console.error('Error loading tasks:', error);
    throw error;
  }
}
