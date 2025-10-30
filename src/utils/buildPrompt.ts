import { FileItem } from './fileTree';
import { generateCodebaseDocumentation } from './codebaseDocumentation';
import { DOC_FORMAT, FILE_SYSTEM, SETTINGS } from './constants';
import {
  loadTemplateContent,
  extractTaskDescription,
} from './promptTemplates';
// @ts-ignore - webpack module resolution issue
import { PromptData, PromptVariant } from '../types/promptTypes';
import { useFileSystemStore } from '../stores/fileSystemStore';
import { AthanorConfig } from '../types/global';

export interface PromptVariables {
  project_name?: string;
  project_info?: string;
  file_contents?: string;
  file_tree?: string;
  task_description?: string;
  selected_files?: string;
  selected_files_with_info?: string;
  task_context?: string;
  task_tab_name?: string;
  supplementary_section?: string;
}

// Simple template renderer to replace {{variable}} with values from an object.
function renderTemplate(
  template: string,
  variables: Record<string, any>
): string {
  // Use a regex to find all instances of {{variableName}}
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    // Check if the key exists in the variables object.
    // Using Object.prototype.hasOwnProperty.call for safety.
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const value = variables[key];
      // If the value is null or undefined, return an empty string to clear the placeholder.
      if (value === null || value === undefined) {
        return '';
      }
      // Otherwise, convert the value to a string and return it.
      return String(value);
    }
    // If the key is not found in variables, return the original match (e.g., "{{variableName}}").
    return match;
  });
}

// Get list of selected files with relative paths and line counts, preserving order
function getSelectedFilesWithInfo(
  items: FileItem[],
  selectedFiles: string[],
  rootPath: string
): string {
  const filesWithInfo: string[] = [];

  // Create a map for quick file lookup
  const fileMap = new Map<string, FileItem>();
  function buildFileMap(item: FileItem) {
    if (item.type === 'file') {
      fileMap.set(item.id, item);
    }
    item.children?.forEach(buildFileMap);
  }
  items.forEach(buildFileMap);

  // Process selected files in order
  selectedFiles.forEach(fileId => {
    const item = fileMap.get(fileId);
    if (item) {
      // Use item.id which is already relative path, just remove leading slash
      const relativePath = item.id.replace(/^\//, '');
      const lineCount = item.lineCount || '?';
      filesWithInfo.push(`${relativePath} (${lineCount} lines)`);
    }
  });

  return filesWithInfo.join('\n');
}

// Get list of selected files with relative paths only, preserving order
function getSelectedFilesList(
  items: FileItem[],
  selectedFiles: string[],
  rootPath: string
): string {
  const filesList: string[] = [];

  // Process selected files in order, just clean up the paths
  selectedFiles.forEach(fileId => {
    // Use fileId which is already relative path, just remove leading slash
    const relativePath = fileId.replace(/^\//, '');
    filesList.push(relativePath);
  });

  return filesList.join('\n');
}

// Build a dynamic prompt using prompt data and variant
export async function buildDynamicPrompt(
  prompt: PromptData,
  variant: PromptVariant,
  items: FileItem[],
  selectedFiles: string[], // Ordered array to preserve user-defined file priority
  neighboringFiles: string[],
  rootPath: string,
  taskDescription: string = '',
  taskContext: string = '',
  activeTabName: string,
  passedFormatTypeOverride?: string
): Promise<string> {
  // Get the store settings and effective configuration
  const {
    includeFileTree,
    formatType: storeFormatType,
    includeProjectInfo,
    effectiveConfig,
  } = useFileSystemStore.getState();

  // Determine the actual format type to use for documentation
  const actualFormatType =
    passedFormatTypeOverride || storeFormatType || DOC_FORMAT.DEFAULT;

  // Use effective config from store, with fallback for safety
  let config: AthanorConfig;
  if (effectiveConfig) {
    config = effectiveConfig;
  } else {
    console.warn('No effective configuration available, using fallback');
    // Import readAthanorConfig dynamically only when needed as fallback
    const { readAthanorConfig } = await import('./configUtils');
    config = await readAthanorConfig(rootPath);
  }

  // Prepare project info with source file path if available
  let projectInfoForPrompt = '';
  if (includeProjectInfo && config.project_info && config.project_info.trim()) {
    if (config.project_info_path) {
      // Convert absolute path to project-relative path
      const relativePath = config.project_info_path
        .replace(rootPath, '')
        .replace(/^[/\\]/, '');
      // If project_info came from a file, add header with relative file path
      projectInfoForPrompt = `# Project info from: ${relativePath}\n\n${config.project_info}`;
    } else {
      // Use project_info as is (already wrapped in tags)
      projectInfoForPrompt = config.project_info;
    }
  }

  // Partition selected files into regular and supplementary
  const regularSelectedIds = selectedFiles.filter(id => !id.startsWith('materials:'));
  const supplementarySelectedIds = selectedFiles.filter(id => id.startsWith('materials:'));

  // Convert file arrays to Sets for efficient lookup
  const selectedItemsSet = new Set(regularSelectedIds);
  const supplementaryItemsSet = new Set(supplementarySelectedIds);
  const neighboringItemsSet = new Set(neighboringFiles);

  // Generate codebase documentation
  const codebaseDoc = await generateCodebaseDocumentation(
    items,
    selectedItemsSet,
    neighboringItemsSet,
    supplementaryItemsSet,
    rootPath,
    actualFormatType,
    config.project_info_path
  );

  // Format task context if non-empty
  const formattedTaskContext = taskContext
    ? `\n<task_context>\n${taskContext}\n</task_context>`
    : '';

  // Sanitize and format the tab name
  const formattedTabName = (activeTabName || '')
    .toUpperCase()
    .replace(/\s+/g, '_') // Replace whitespace with underscores
    .replace(/[^A-Z0-9_]/g, ''); // Remove any remaining non-alphanumeric characters except underscore

  // Create a copy of codebaseDoc to avoid modifying the original
  const codebaseContent = { ...codebaseDoc };

  // If file tree is disabled, set it to empty string
  if (!includeFileTree) {
    codebaseContent.file_tree = '';
  }

  // Construct the supplementary section with header if there's content
  const supplementarySection = codebaseDoc.supplementary_contents?.trim()
    ? `\n\n## Supplementary Materials\n\nThe following files are reference material for the current task.\n\n${codebaseDoc.supplementary_contents.trim()}\n`
    : '';

  // Prepare variables for template
  const variables: PromptVariables = {
    project_name: config.project_name,
    project_info: projectInfoForPrompt,
    task_description: taskDescription,
    task_context: formattedTaskContext,
    task_tab_name: formattedTabName,
    selected_files: getSelectedFilesList(items, selectedFiles, rootPath),
    selected_files_with_info: getSelectedFilesWithInfo(
      items,
      selectedFiles,
      rootPath
    ),
    supplementary_section: supplementarySection,
    ...codebaseContent, // Contains file_contents and modified file_tree
  };

  // Use the variant content directly
  return renderTemplate(variant.content, variables);
}
