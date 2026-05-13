import { DiffBlock } from '../types/global';

// Remove a single empty line at the start of content if present.
// Preserves lines containing whitespace characters.
export function removeInitialEmptyLine(content: string): string {
  if (!content) return '';

  // Check if content starts with a single newline
  if (content.startsWith('\n') && !content.startsWith('\n ') && !content.startsWith('\n\t')) {
    return content.slice(1);
  }

  return content;
}

// Parse diff blocks from file content
export function parseDiffBlocks(content: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  // Modified regex to properly handle optional punctuation after SEARCH and REPLACE
  // Allows one of [?<>!.,:;] immediately following the literal keyword
  // Updated to require the separator to be on its own line to avoid matching decorative comments
  const regex =
    /<<<<<<< SEARCH[?<>!.,:;]?\n([\s\S]*?)\n^=======$\n([\s\S]*?)>>>>>>> REPLACE[?<>!.,:;]?/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    // Validate that search content isn't empty
    if (!match[1].trim()) {
      throw new Error('Search block cannot be empty');
    }

    // Trim a single trailing newline from the replace block. This prevents an extra
    // newline from being inserted, as the original newline following the SEARCH
    // block is preserved during the string replacement operation.
    const replaceContent = match[2].endsWith('\n') ? match[2].slice(0, -1) : match[2];

    blocks.push({
      search: match[1],
      replace: replaceContent,
    });
  }

  if (blocks.length === 0) {
    throw new Error('No valid diff blocks found in content');
  }

  return blocks;
}

// Normalize line endings while preserving other whitespace
export function normalizeLineEndings(content: string): string {
  if (!content) return '';
  // First normalize line endings
  let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Then replace non-breaking spaces with regular spaces
  normalized = normalized.replace(/\u00A0/g, ' ');
  return normalized;
}

// Process file update based on operation type
export function processFileUpdate(
  operation: 'UPDATE_FULL' | 'UPDATE_DIFF',
  filePath: string,
  newCodeOrBlocks: string | DiffBlock[],
  currentContent: string
): string {
  if (operation === 'UPDATE_FULL') {
    return normalizeLineEndings(newCodeOrBlocks as string);
  }

  // For diff updates, apply the pre-parsed changes
  const diffBlocks = newCodeOrBlocks as DiffBlock[];
  const normalizedCurrentContent = normalizeLineEndings(currentContent);

  // Process each block sequentially, starting with original content
  let processedContent = normalizedCurrentContent;

  // Process each diff block
  for (let i = 0; i < diffBlocks.length; i++) {
    const block = diffBlocks[i];

    // Try exact match replacement
    if (processedContent.includes(block.search)) {
      // Found exact match, perform simple replacement
      processedContent = processedContent.replace(block.search, block.replace);
    } else {
      // If exact match fails, throw an error
      throw new Error(
        `Strict matching failed for block ${i + 1} in ${filePath}. ` +
          `Exact string match not found. Search content beginning: ` +
          `"${block.search.substring(0, 50)}${block.search.length > 50 ? '...' : ''}"`
      );
    }
  }

  // Return the final processed content with any final cleanup
  return removeInitialEmptyLine(processedContent);
}
