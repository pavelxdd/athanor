import { FileItem, sortItems, getBaseName } from './fileTree';
import { DOC_FORMAT } from './constants';
import { isTextFileExtension, isBufferText } from './fileTextDetection';

// Get the appropriate language for code block formatting
export function getFileLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
  };
  return languageMap[ext] || 'plaintext';
}

// Generate tree visualization
function generateFileTree(
  items: FileItem[],
  selectedItems: Set<string>,
  level: number = 0,
  isLast: boolean = true,
  parentPrefix: string = ''
): string {
  if (!items || items.length === 0) return '';

  let result = '';
  items.forEach((item, index) => {
    const isLastItem = index === items.length - 1;
    const prefix = level === 0 ? '' : `${parentPrefix}${isLast ? '' : '│   '}`;
    const connector = level === 0 ? '' : `${isLastItem ? '└── ' : '├── '}`;
    // Use "." for root level folder instead of actual folder name
    const displayName = level === 0 ? '.' : item.name;

    result += `${prefix}${connector}${displayName}${item.type === 'folder' ? '/' : ''}\n`;

    if (item.type === 'folder' && item.children?.length) {
      result += generateFileTree(
        sortItems(item.children),
        selectedItems,
        level + 1,
        isLastItem,
        prefix
      );
    }
  });

  return result;
}

// Sanitize a filename for use in XML tags
export function sanitizeForXmlTag(filePath: string): string {
  // Extract just the filename without path
  const baseName = getBaseName(filePath);

  // Replace non-alphanumeric characters (except underscores) with underscores
  // Keep file extension but replace the dot with underscore
  let sanitized = baseName.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure the tag starts with a letter (XML requirement)
  if (!/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 'file_' + sanitized;
  }

  return sanitized;
}

// Format a single file's content with appropriate code block or XML tags
export function formatSingleFile(
  filePath: string,
  content: string,
  rootPath: string = '',
  _isSelected: boolean = false,
  formatType: string = DOC_FORMAT.MARKDOWN
): string {
  const relativePath = rootPath ? filePath.replace(rootPath, '').replace(/^[/\\]/, '') : filePath;

  if (formatType === DOC_FORMAT.XML) {
    const tagName = sanitizeForXmlTag(relativePath);
    return `# ${relativePath}\n\n<file_${tagName}>\n${content}\n</file_${tagName}>\n`;
  } else {
    // Default to markdown formatting
    const language = getFileLanguage(filePath);
    return `# ${relativePath}\n\n\`\`\`${language}\n${content}\n\`\`\`\n`;
  }
}

// Helper function to generate file content strings
async function generateFileContentString(
  fileItems: FileItem[],
  selectedItemsSet: Set<string>,
  neighboringItemsSet: Set<string>,
  supplementaryItemsSet: Set<string>,
  rootPath: string,
  format: string,
  projectInfoFilePath?: string
): Promise<{ regularContent: string; supplementaryContent: string }> {
  const regularFileContents: string[] = [];
  const supplementaryFileContents: string[] = [];

  // Collect all files that need processing
  interface FileToProcess {
    path: string;
    isSelected: boolean;
    isNeighbor: boolean;
    isSupplementary: boolean;
  }
  const filesToProcess: FileToProcess[] = [];

  // Recursive collection
  const collectFiles = (items: FileItem[]): void => {
    for (const item of sortItems(items)) {
      if (item.type === 'file') {
        const isSelected = selectedItemsSet.has(item.id);
        const isNeighbor = neighboringItemsSet.has(item.id);
        const isSupplementary = supplementaryItemsSet.has(item.id);

        // Only include content for selected, neighboring, or supplementary files
        if (!isSelected && !isNeighbor && !isSupplementary) {
          continue;
        }

        // Check if this file is the source of project_info
        if (projectInfoFilePath && item.path === projectInfoFilePath) {
          const relativePath = rootPath
            ? item.path.replace(rootPath, '').replace(/^[/\\]/, '')
            : item.path;

          // Add placeholder message instead of duplicating content
          const placeholderContent =
            `# ${relativePath}${isSelected ? ' *' : ''}\n\n` +
            `The content of this file is fully reported above inside \`<project_info>\` tags.\n`;

          if (isSupplementary) {
            supplementaryFileContents.push(placeholderContent);
          } else {
            regularFileContents.push(placeholderContent);
          }
          continue;
        }

        filesToProcess.push({
          path: item.path,
          isSelected,
          isNeighbor,
          isSupplementary,
        });
      } else if (item.children) {
        collectFiles(item.children);
      }
    }
  };

  collectFiles(fileItems);

  // If no files to read, return early
  if (filesToProcess.length === 0) {
    return {
      regularContent: regularFileContents.join('\n'),
      supplementaryContent: supplementaryFileContents.join('\n'),
    };
  }

  // Batch read all files as binary buffers
  const paths = filesToProcess.map((f) => f.path);
  const results = await window.fileSystem.readMultiple(paths, { encoding: null });

  // Process each file
  for (let i = 0; i < filesToProcess.length; i++) {
    const { path, isSelected, isNeighbor, isSupplementary } = filesToProcess[i];
    const bufferOrNull = results[path];

    // Handle read errors
    if (bufferOrNull === null) {
      console.error(`Error reading file ${path}: batch read returned null`);
      continue;
    }

    // Convert to ArrayBuffer (Buffer in Node.js is a Uint8Array)
    let arrayBuffer: ArrayBuffer;
    if (bufferOrNull instanceof ArrayBuffer) {
      arrayBuffer = bufferOrNull;
    } else if (typeof bufferOrNull === 'string') {
      // Should not happen because we requested encoding: null
      console.warn(`File ${path} returned as string, not buffer`);
      continue;
    } else {
      // Assume it's a Node.js Buffer (Uint8Array)
      arrayBuffer = (bufferOrNull.buffer as ArrayBuffer).slice(
        bufferOrNull.byteOffset,
        bufferOrNull.byteOffset + bufferOrNull.byteLength
      );
    }

    // Check if file is text using extension first, then buffer analysis
    let isText = isTextFileExtension(path);
    if (!isText) {
      isText = isBufferText(arrayBuffer);
    }

    if (!isText) {
      console.log(`Skipping non-text file: ${path}`);
      continue;
    }

    // Decode buffer to UTF‑8 string
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const contentString = decoder.decode(arrayBuffer);

    if (!contentString) {
      continue;
    }

    const formattedContent = formatSingleFile(path, contentString, rootPath, false, format);

    if (isSupplementary) {
      supplementaryFileContents.push(formattedContent);
    } else if (isSelected || isNeighbor) {
      regularFileContents.push(formattedContent);
    }
  }

  return {
    regularContent: regularFileContents.join('\n'),
    supplementaryContent: supplementaryFileContents.join('\n'),
  };
}

// Generate full codebase documentation
export async function generateCodebaseDocumentation(
  items: FileItem[],
  selectedItems: Set<string>,
  neighboringItems: Set<string>,
  supplementaryItemsSet: Set<string>,
  rootPath: string,
  formatType: string = DOC_FORMAT.MARKDOWN,
  projectInfoFilePath?: string
): Promise<{ file_contents: string; supplementary_contents: string; file_tree: string }> {
  const rawFileTreeContent = generateFileTree(items, selectedItems);
  const fileTreeContent = `<file_tree>\n${rawFileTreeContent}</file_tree>\n`;

  // Use the new helper function to generate content
  const { regularContent, supplementaryContent } = await generateFileContentString(
    items,
    selectedItems,
    neighboringItems,
    supplementaryItemsSet,
    rootPath,
    formatType,
    projectInfoFilePath
  );

  return {
    file_contents: regularContent,
    supplementary_contents: supplementaryContent,
    file_tree: fileTreeContent,
  };
}
