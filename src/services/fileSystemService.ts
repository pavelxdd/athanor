import {
  FileItem,
  sortItems,
  isEmptyFolder,
  getFileItemById,
} from '../utils/fileTree';
import { FILE_SYSTEM } from '../utils/constants';

// Function to normalize content with consistent line endings
function normalizeContent(content: string): string {
  return (
    content
      .replace(/\r\n/g, '\n') // Convert Windows line endings to Unix
      .replace(/\r/g, '\n') // Convert old Mac line endings to Unix
      .split('\n')
      .map((line) => line.trimEnd()) // Remove trailing whitespace from each line
      .join('\n')
      .trim() + '\n'
  ); // Ensure single trailing newline
}

// Function to count lines in a file
async function countFileLines(path: string): Promise<number> {
  try {
    const content = await window.fileService.read(path, {
      encoding: 'utf8',
    });
    // Count lines after normalizing line endings
    return normalizeContent(content as string).split('\n').length;
  } catch (error) {
    console.error(`Error counting lines in file ${path}:`, error);
    return 0;
  }
}

export async function buildFileTree(
  basePath: string,
  currentPath: string = '',
  isMaterialsTree: boolean = false,
  applyIgnores: boolean = true
): Promise<FileItem> {
  // For materials tree, we might still want to do it manually if it's special, 
  // but let's try to use the optimized path for everything.
  // The main process `getFileTree` handles recursion.
  
  // Construct the full path
  const fullPath = await window.pathUtils.join(basePath, currentPath);
  
  try {
    // Use the optimized IPC call
    const tree = await window.fileService.getFileTree(fullPath);
    
    if (!tree) {
      throw new Error('Failed to get file tree');
    }

    // Post-process the tree to match exact FileItem structure if needed, 
    // and handle specific logic like "Supplementary Materials" name
    if (isMaterialsTree && !currentPath) {
      tree.name = 'Supplementary Materials';
      tree.id = `materials:${currentPath}`;
      // We might need to fix IDs recursively for materials tree to match 'materials:...' convention
      // But for now let's assume standard IDs are fine or we fix them here.
      
      // Helper to prefix IDs
      const prefixIds = (item: any) => {
        if (item.id !== '/') {
           // If id is relative path, prepend materials:
           item.id = `materials:${item.id}`;
        } else {
           item.id = 'materials:';
        }
        if (item.children) {
          item.children.forEach(prefixIds);
        }
      };
      prefixIds(tree);
    }

    // Note: The main process getFileTree skips lineCount for performance. 
    // If lineCount is strictly required for the UI (e.g. stats), we would need to fetch it.
    // For now, we accept 0/undefined to keep it fast.

    return tree;
  } catch (error) {
    console.error(`Error building file tree for ${fullPath}:`, error);
    return {
      id: fullPath,
      name: currentPath ? currentPath.split('/').pop() || '' : basePath.split('/').pop() || '',
      type: 'file', // Fallback
      path: fullPath,
      error: true,
    };
  }
}

// Read file content with normalization
export async function readFileContent(path: string): Promise<string> {
  try {
    const content = await window.fileService.read(path, {
      encoding: 'utf8',
    });
    return normalizeContent(content as string);
  } catch (error) {
    console.error(`Error reading file ${path}:`, error);
    throw error;
  }
}

// Read file content by relative path within project
export async function readFileByPath(relativePath: string): Promise<string> {
  try {
    // Convert to OS-specific format if needed
    const fullPath = await window.fileService.resolve(relativePath);

    // Read and return the file content
    const content = await window.fileService.read(relativePath, {
      encoding: 'utf8',
    });
    return normalizeContent(content as string);
  } catch (error) {
    console.error(`Error reading file ${relativePath}:`, error);
    throw error;
  }
}

// Function to get all files in a tree
export function getAllFiles(tree: FileItem, maxDepth: number = 100): string[] {
  function collectFiles(node: FileItem, depth: number): string[] {
    if (depth <= 0) {
      console.warn(`Maximum depth (${maxDepth}) reached while collecting files from path: ${node.path}`);
      return [];
    }
    
    if (node.type === 'file') {
      return [node.path];
    }

    return (node.children || []).flatMap(child => collectFiles(child, depth - 1));
  }
  
  return collectFiles(tree, maxDepth);
}

// Function to get all folders in a tree
export function getAllFolders(tree: FileItem, maxDepth: number = 100): string[] {
  function collectFolders(node: FileItem, depth: number): string[] {
    if (depth <= 0) {
      console.warn(`Maximum depth (${maxDepth}) reached while collecting folders from path: ${node.path}`);
      return [];
    }
    
    if (node.type === 'file') {
      return [];
    }

    const folders = [node.path];
    return folders.concat((node.children || []).flatMap(child => collectFolders(child, depth - 1)));
  }
  
  return collectFolders(tree, maxDepth);
}

// Function to find a file/folder in the tree by path
export function findItemByPath(
  tree: FileItem,
  targetPath: string,
  maxDepth: number = 100
): FileItem | null {
  function search(node: FileItem, depth: number): FileItem | null {
    if (depth <= 0) {
      console.warn(`Maximum depth (${maxDepth}) reached while searching for path: ${targetPath}`);
      return null;
    }
    
    if (node.path === targetPath) {
      return node;
    }

    if (node.type === 'folder' && node.children) {
      for (const child of node.children) {
        const found = search(child, depth - 1);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
  
  return search(tree, maxDepth);
}

// Function to update a specific item in the tree
export function updateItemInTree(
  tree: FileItem,
  targetPath: string,
  updates: Partial<FileItem>
): FileItem {
  if (tree.path === targetPath) {
    return { ...tree, ...updates };
  }

  if (tree.type === 'folder' && tree.children) {
    return {
      ...tree,
      children: tree.children.map((child) =>
        updateItemInTree(child, targetPath, updates)
      ),
    };
  }

  return tree;
}
