import { FileOperation, FileOperationType } from '../../types/global';
import { CommandType, COMMAND_TYPES } from '../types';
import { parseStringPromise } from 'xml2js';
import {
  processFileUpdate,
  normalizeLineEndings,
} from '../../utils/fileOperations';
import { copyFailedDiffContent } from '../../actions/ManualCopyAction';
import { useLogStore } from '../../stores/logStore';

export interface Command {
  type: CommandType;
  content: string | FileOperation[]; // Content can be a string or an array of file operations
  fullContent?: string;
}

/**
 * Parses the content of an <ath command="apply changes"> block.
 * This is a helper function for the main parseCommand function.
 */
async function parseApplyChangesContent(
  commandContent: any // Parsed XML object from xml2js
): Promise<FileOperation[]> {
  const operations: FileOperation[] = [];
  const { addLog } = useLogStore.getState();

  const fileBlocks = commandContent.file;
  if (!fileBlocks || !Array.isArray(fileBlocks)) {
    addLog('No <file> blocks found inside the apply changes command');
    return operations;
  }

  const failedDiffPaths: string[] = [];

  for (const block of fileBlocks) {
    try {
      const path = block.file_path?.[0]?._;
      let operation: FileOperationType = block.file_operation?.[0]?._;
      const message = block.file_message?.[0]?._ || '';
      const newPath = block.file_path_new?.[0]?._;
      const code = block.file_code?.[0]?._ || block.file_code?.[0] || '';

      if (!path || !operation) {
        addLog('Skipping malformed file block: missing path or operation.');
        continue;
      }

      let oldCode = '';
      let processedNewCode = '';
      let warning: string | undefined;

      if (operation === 'CREATE') {
        const fileExists = await window.fileService.exists(path);
        if (fileExists) {
          operation = 'UPDATE_FULL';
          warning = `File already exists. Operation changed from CREATE to a full update.`;
          addLog(`Warning for ${path}: ${warning}`);
        }
      }

      if (operation !== 'CREATE') {
        try {
          if (!(await window.fileService.isDirectory(path))) {
            oldCode = (await window.fileService.read(path, {
              encoding: 'utf8',
            })) as string;
          }
        } catch (error) {
          if (operation !== 'DELETE' && operation !== 'RENAME') {
            throw error;
          }
        }
      }

      if (operation === 'DELETE' || operation === 'RENAME') {
        processedNewCode = '';
      } else if (
        operation === 'CREATE' ||
        operation === 'APPEND' ||
        operation === 'PREPEND' ||
        operation === 'UPDATE_FULL'
      ) {
        processedNewCode = normalizeLineEndings(code);
      } else if (operation === 'UPDATE_DIFF') {
        // For UPDATE_DIFF, we parse the blocks but don't apply them yet.
        const { parseDiffBlocks } = await import(
          '../../utils/fileOperations'
        );
        try {
          const diffBlocks = parseDiffBlocks(code);
          operations.push({
            file_message: message,
            file_operation: operation,
            file_path: path,
            new_file_path: newPath,
            new_code: '', // new_code is generated on apply
            old_code: normalizeLineEndings(oldCode),
            accepted: false,
            rejected: false,
            diff_blocks: diffBlocks,
            warning: warning,
          });
        } catch (error) {
          addLog(`Error parsing diff blocks for ${path}: ${error}`);
          failedDiffPaths.push(path);
        }
        continue;
      }

      operations.push({
        file_message: message,
        file_operation: operation,
        file_path: path,
        new_file_path: newPath,
        new_code: processedNewCode,
        old_code: normalizeLineEndings(oldCode),
        accepted: false,
        rejected: false,
        warning: warning,
      });
    } catch (error) {
      const filePath = block.file_path?.[0] || 'unknown file';
      addLog(`Failed to process file: ${filePath} - ${error}`);
    }
  }

  if (failedDiffPaths.length > 0) {
    const currentDir = await window.fileService.getCurrentDirectory();
    addLog({
      message: `${failedDiffPaths.length} UPDATE_DIFF operation(s) failed - Click to copy files`,
      onClick: async () => {
        await copyFailedDiffContent({
          filePaths: failedDiffPaths,
          addLog,
          rootPath: currentDir,
        });
      },
    });
  }

  return operations;
}

/**
 * Parses clipboard content for Athanor commands using a full XML parser.
 * Extracts the first <athanor>...</athanor> block from the text and parses it.
 * Legacy formats without the root tag are no longer supported.
 */
export async function parseCommand(
  clipboardContent: string
): Promise<Command[] | null> {
  const { addLog } = useLogStore.getState();
  const normalizedContent = normalizeLineEndings(clipboardContent.trim());

  // Use a regex to extract the first complete <athanor> block from the text.
  const athanorRegex = /<athanor>([\s\S]*?)<\/athanor>/i;
  const athanorMatch = normalizedContent.match(athanorRegex);

  // If no <athanor> block is found, there are no valid commands.
  if (!athanorMatch || !athanorMatch[0]) {
    return null;
  }

  const xmlToParse = athanorMatch[0];

  try {
    const parsedJs = await parseStringPromise(xmlToParse, {
      explicitArray: true,
      explicitCharkey: true,
      trim: true,
      charkey: '_',
      attrkey: '$',
    });

    if (!parsedJs.athanor || !parsedJs.athanor.ath) {
      return null;
    }

    const athBlocks = parsedJs.athanor.ath;
    const commands: Command[] = [];

    for (const block of athBlocks) {
      const commandType = block.$?.command as CommandType;
      if (!commandType || !Object.values(COMMAND_TYPES).includes(commandType)) {
        continue;
      }

      if (commandType === COMMAND_TYPES.APPLY_CHANGES) {
        const operations = await parseApplyChangesContent(block);
        if (operations.length > 0) {
          commands.push({
            type: commandType,
            content: operations,
          });
        }
      } else if (commandType === COMMAND_TYPES.SELECT) {
        // Parse select command: new format with <file_path> tags (old plain text format not supported)
        if (!block.file_path || !Array.isArray(block.file_path)) {
          addLog('Select command ignored: missing <file_path> tags. Please use the new format with <file_path> tags.');
          continue; // Skip this command entirely
        }
        // Collect paths from <file_path> tags
        const paths = block.file_path
          .map((fp: any) => fp._ || '')
          .filter((path: string) => path.trim().length > 0);
        // Join with Unit Separator (ASCII 31) to preserve paths with spaces
        const content = paths.join('\x1F');
        commands.push({
          type: commandType,
          content: content.trim(),
        });
      } else {
        const content = block._ || '';
        commands.push({
          type: commandType,
          content: content.trim(),
        });
      }
    }

    return commands.length > 0 ? commands : null;
  } catch (error) {
    addLog(`XML parsing failed: ${error}`);
    console.error('Full XML parsing error:', error);
    return null;
  }
}
