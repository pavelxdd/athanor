import { FileOperation, FileOperationType } from '../../types/global';
import { CommandType, COMMAND_TYPES } from '../types';
import { parseStringPromise } from 'xml2js';
import { normalizeLineEndings } from '../../utils/fileOperations';
import { copyFailedDiffContent } from '../../actions/ManualCopyAction';
import { useLogStore } from '../../stores/logStore';

export interface Command {
  type: CommandType;
  content: string | FileOperation[]; // Content can be a string or an array of file operations
  fullContent?: string;
}

interface XmlTextNode {
  _: string;
}

type XmlTextValue = string | XmlTextNode;

interface XmlCommandBlock {
  $?: {
    type?: string;
  };
  _?: string;
  file?: XmlFileBlock[];
  file_path?: XmlTextValue[];
}

interface XmlFileBlock {
  file_code?: XmlTextValue[];
  file_message?: XmlTextValue[];
  file_operation?: XmlTextValue[];
  file_path?: XmlTextValue[];
  file_path_new?: XmlTextValue[];
}

interface ParsedAthanorXml {
  athanor?: {
    command?: XmlCommandBlock[];
  };
}

const FILE_OPERATION_TYPES = [
  'CREATE',
  'UPDATE_FULL',
  'UPDATE_DIFF',
  'DELETE',
  'RENAME',
  'APPEND',
  'PREPEND',
] as const satisfies readonly FileOperationType[];

function getXmlText(value: XmlTextValue | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  return value?._ ?? '';
}

function isCommandType(value: string): value is CommandType {
  return Object.values(COMMAND_TYPES).includes(value as CommandType);
}

function isFileOperationType(value: string): value is FileOperationType {
  return FILE_OPERATION_TYPES.includes(value as FileOperationType);
}

/**
 * Parses the content of an <command type="apply changes"> block.
 * This is a helper function for the main parseCommand function.
 */
async function parseApplyChangesContent(commandContent: XmlCommandBlock): Promise<FileOperation[]> {
  const { addLog } = useLogStore.getState();

  const fileBlocks = commandContent.file;
  if (!fileBlocks || !Array.isArray(fileBlocks)) {
    addLog('No <file> blocks found inside the apply changes command');
    return [];
  }

  const operations: FileOperation[] = [];
  const failedDiffPaths: string[] = [];

  // First pass: collect file data and determine which files need to be read
  interface FileData {
    path: string;
    rawOperation: string;
    operation: FileOperationType;
    message: string;
    newPath?: string;
    code: string;
    warning?: string;
    needOldCode: boolean;
    ignoreReadError: boolean; // For DELETE/RENAME operations
    isDirectory?: boolean; // Will be filled later
  }

  const fileDataList: FileData[] = [];
  const pathsToCheckExistence: string[] = []; // For CREATE operations that need exists check

  for (const block of fileBlocks) {
    try {
      const path = getXmlText(block.file_path?.[0]);
      const rawOperation = getXmlText(block.file_operation?.[0]);

      if (!path || !rawOperation) {
        addLog('Skipping malformed file block: missing path or operation.');
        continue;
      }

      const operationText = rawOperation.toUpperCase();
      if (!isFileOperationType(operationText)) {
        addLog(`Skipping file block with unsupported operation: ${rawOperation}`);
        continue;
      }

      const message = getXmlText(block.file_message?.[0]);
      const newPath = getXmlText(block.file_path_new?.[0]) || undefined;
      const code = getXmlText(block.file_code?.[0]);
      const warning: string | undefined = undefined;

      // For CREATE operations, we need to check if file exists
      if (operationText === 'CREATE') {
        pathsToCheckExistence.push(path);
      }

      const needOldCode = operationText !== 'CREATE';
      const ignoreReadError = operationText === 'DELETE' || operationText === 'RENAME';

      fileDataList.push({
        path,
        rawOperation,
        operation: operationText,
        message,
        newPath,
        code,
        warning,
        needOldCode,
        ignoreReadError,
      });
    } catch (error) {
      const filePath = getXmlText(block.file_path?.[0]) || 'unknown file';
      addLog(`Failed to process file block: ${filePath} - ${String(error)}`);
    }
  }

  // Batch check file existence for CREATE operations
  const existenceResults: Record<string, boolean> = {};
  if (pathsToCheckExistence.length > 0) {
    await Promise.all(
      pathsToCheckExistence.map(async (path) => {
        try {
          existenceResults[path] = await window.fileService.exists(path);
        } catch {
          // If exists check fails, assume file doesn't exist
          existenceResults[path] = false;
        }
      })
    );
  }

  // Update operation types for CREATE files that already exist
  for (const fileData of fileDataList) {
    if (fileData.operation === 'CREATE' && existenceResults[fileData.path]) {
      fileData.operation = 'UPDATE_FULL';
      fileData.warning = `File already exists. Operation changed from CREATE to a full update.`;
      addLog(`Warning for ${fileData.path}: ${fileData.warning}`);
      fileData.needOldCode = true; // Now we need old code for UPDATE_FULL
    }
  }

  // Collect paths that need old code reading
  const pathsToRead: string[] = [];
  for (const fileData of fileDataList) {
    if (fileData.needOldCode) {
      pathsToRead.push(fileData.path);
    }
  }

  // Batch check which paths are directories (for those that need reading)
  const directoryChecks: Record<string, boolean> = {};
  if (pathsToRead.length > 0) {
    await Promise.all(
      pathsToRead.map(async (path) => {
        try {
          directoryChecks[path] = await window.fileService.isDirectory(path);
        } catch {
          // If isDirectory check fails, assume it's not a directory
          directoryChecks[path] = false;
        }
      })
    );
  }

  // Filter out directories from reading (they don't have old code)
  const pathsToReadFiles = pathsToRead.filter((path) => !directoryChecks[path]);

  // Batch read file contents for non-directory paths
  const fileContents: Record<string, string | Buffer | null> = {};
  if (pathsToReadFiles.length > 0) {
    const readResults = await window.fileService.readMultiple(pathsToReadFiles, {
      encoding: 'utf8',
    });
    Object.assign(fileContents, readResults);
  }

  // Second pass: process each file data with old code
  for (const fileData of fileDataList) {
    try {
      let oldCode = '';
      let processedNewCode = '';

      // Get old code if needed
      if (fileData.needOldCode && !directoryChecks[fileData.path]) {
        const content = fileContents[fileData.path];
        if (content !== null && content !== undefined) {
          oldCode = content as string;
        } else if (!fileData.ignoreReadError) {
          // Read failed and we don't ignore errors
          throw new Error(`Failed to read file: ${fileData.path}`);
        }
      }

      if (fileData.operation === 'DELETE' || fileData.operation === 'RENAME') {
        processedNewCode = '';
      } else if (
        fileData.operation === 'CREATE' ||
        fileData.operation === 'APPEND' ||
        fileData.operation === 'PREPEND' ||
        fileData.operation === 'UPDATE_FULL'
      ) {
        processedNewCode = normalizeLineEndings(fileData.code);
      } else if (fileData.operation === 'UPDATE_DIFF') {
        // For UPDATE_DIFF, we parse the blocks but don't apply them yet.
        const { parseDiffBlocks } = await import('../../utils/fileOperations');
        try {
          const diffBlocks = parseDiffBlocks(fileData.code);
          operations.push({
            file_message: fileData.message,
            file_operation: fileData.operation,
            file_path: fileData.path,
            new_file_path: fileData.newPath,
            new_code: '', // new_code is generated on apply
            old_code: normalizeLineEndings(oldCode),
            accepted: false,
            rejected: false,
            diff_blocks: diffBlocks,
            warning: fileData.warning,
          });
        } catch (error) {
          addLog(`Error parsing diff blocks for ${fileData.path}: ${String(error)}`);
          failedDiffPaths.push(fileData.path);
        }
        continue;
      }

      operations.push({
        file_message: fileData.message,
        file_operation: fileData.operation,
        file_path: fileData.path,
        new_file_path: fileData.newPath,
        new_code: processedNewCode,
        old_code: normalizeLineEndings(oldCode),
        accepted: false,
        rejected: false,
        warning: fileData.warning,
      });
    } catch (error) {
      addLog(`Failed to process file: ${fileData.path} - ${String(error)}`);
    }
  }

  if (failedDiffPaths.length > 0) {
    const currentDir = await window.fileService.getCurrentDirectory();
    addLog({
      message: `${failedDiffPaths.length} UPDATE_DIFF operation(s) failed - Click to copy files`,
      onClick: () => {
        void copyFailedDiffContent({
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
export async function parseCommand(clipboardContent: string): Promise<Command[] | null> {
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
    const parsedXml = (await parseStringPromise(xmlToParse, {
      explicitArray: true,
      explicitCharkey: true,
      trim: true,
      charkey: '_',
      attrkey: '$',
    })) as unknown;
    const parsedJs = parsedXml as ParsedAthanorXml;

    if (!parsedJs.athanor?.command) {
      return null;
    }

    const athBlocks = parsedJs.athanor.command;
    const commands: Command[] = [];

    for (const block of athBlocks) {
      const commandType = block.$?.type;
      if (!commandType || !isCommandType(commandType)) {
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
          addLog(
            'Select command ignored: missing <file_path> tags. Please use the new format with <file_path> tags.'
          );
          continue; // Skip this command entirely
        }
        // Collect paths from <file_path> tags
        const paths = block.file_path
          .map((filePathNode) => getXmlText(filePathNode))
          .filter((path) => path.trim().length > 0);
        // Join with Unit Separator (ASCII 31) to preserve paths with spaces
        const content = paths.join('\x1F');
        commands.push({
          type: commandType,
          content: content.trim(),
        });
      } else {
        const content = block._ ?? '';
        commands.push({
          type: commandType,
          content: content.trim(),
        });
      }
    }

    return commands.length > 0 ? commands : null;
  } catch (error) {
    addLog(`XML parsing failed: ${String(error)}`);
    console.error('Full XML parsing error:', error);
    return null;
  }
}
