import { FileItem, isEmptyFolder, getFileItemById } from './fileTree';

// Get selectable descendants (non-empty folders and files)
export function getSelectableDescendants(item: FileItem): string[] {
  if (item.type === 'file') {
    return [item.id];
  }

  if (!item.children?.length || isEmptyFolder(item)) {
    return [];
  }

  const selectableIds: string[] = [];
  item.children.forEach((child) => {
    selectableIds.push(...getSelectableDescendants(child));
  });

  return selectableIds;
}

// Check if all descendants are selected
export function areAllDescendantsSelected(item: FileItem, selectedItems: Set<string>): boolean {
  if (item.type === 'file') {
    return selectedItems.has(item.id);
  }

  if (!item.children?.length || isEmptyFolder(item)) {
    return false;
  }

  const selectableDescendants = getSelectableDescendants(item);
  return (
    selectableDescendants.length > 0 && selectableDescendants.every((id) => selectedItems.has(id))
  );
}

// Check if any descendants are selected
export function areSomeDescendantsSelected(item: FileItem, selectedItems: Set<string>): boolean {
  if (item.type === 'file') {
    return selectedItems.has(item.id);
  }

  if (!item.children?.length || isEmptyFolder(item)) {
    return false;
  }

  const selectableDescendants = getSelectableDescendants(item);
  return selectableDescendants.some((id) => selectedItems.has(id));
}

// Calculate total lines across selected files
export async function calculateSelectionTotals(
  selectedItems: Set<string> | string[],
  fileTree: FileItem[]
): Promise<number> {
  if (!fileTree || fileTree.length === 0) return 0;
  let total = 0;

  // Convert array to Set if needed for consistent iteration
  const selectedSet = Array.isArray(selectedItems) ? new Set(selectedItems) : selectedItems;

  // Get line count for each selected file, fetching on-demand if not available
  for (const id of selectedSet) {
    const item = getFileItemById(id, fileTree);
    if (item?.type === 'file') {
      if (item.lineCount) {
        // Use existing line count if available
        total += item.lineCount;
      } else {
        // Fetch line count on demand
        try {
          const content = await window.fileService.read(item.path, { encoding: 'utf8' });
          // Count lines after normalizing line endings
          const contentStr = content as string;
          const normalizedContent =
            contentStr
              .replace(/\r\n/g, '\n') // Convert Windows line endings to Unix
              .replace(/\r/g, '\n') // Convert old Mac line endings to Unix
              .split('\n')
              .map((line) => line.trimEnd()) // Remove trailing whitespace from each line
              .join('\n')
              .trim() + '\n'; // Ensure single trailing newline
          const lineCount = normalizedContent.split('\n').length;
          total += lineCount;
        } catch (error) {
          console.error(`Error counting lines in file ${item.path}:`, error);
          // If we can't read the file, don't add to the total
        }
      }
    }
  }

  return total;
}
