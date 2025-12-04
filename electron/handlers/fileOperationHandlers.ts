import { ipcMain } from 'electron';
import { FileService } from '../services/FileService';
import { PathUtils } from '../services/PathUtils';

// Store fileService instance
let _fileService: FileService;

export function setupFileOperationHandlers(fileService: FileService) {
  // Store the fileService instance for later use
  _fileService = fileService;

  // Handle getting resources path
  ipcMain.handle('fs:getResourcesPath', async () => {
    try {
      return await _fileService.getResourcesPath();
    } catch (error) {
      handleError(error, 'getting resources path');
    }
  });

  // Handle getting template path
  ipcMain.handle(
    'fs:getPromptTemplatePath',
    async (_, templateName: string) => {
      try {
        return await _fileService.getPromptTemplatePath(templateName);
      } catch (error) {
        handleError(error, 'getting template path');
      }
    }
  );

  // Handle reading directory contents with ignore rules
  ipcMain.handle('fs:readDirectory', async (_, dirPath: string, applyIgnores = true) => {
    try {
      // Normalize to Unix format
      const unix = _fileService.toUnix(dirPath);
      
      // Only relativize if absolute AND inside base directory
      const pathForFs = 
        PathUtils.isAbsolute(unix) && PathUtils.isPathInside(_fileService.getBaseDir(), unix)
          ? _fileService.relativize(unix)
          : unix;  // absolute path outside project or already relative, use as-is

      return await _fileService.readdir(pathForFs, { applyIgnores });
    } catch (error) {
      handleError(error, `reading directory ${dirPath}`);
    }
  });

  // Handle reading file contents
  ipcMain.handle('fs:readFile', async (_, filePath: string, options?: { encoding?: BufferEncoding }) => {
    try {
      const pathForFs = _fileService.toUnix(filePath); // Normalize path
      const data = await _fileService.read(pathForFs, options);
      return data;
    } catch (error) {
      // For file reading, we just return null/throw so renderer can handle "file not found" etc
      // Don't necessarily show global error toast for every missing file check
      console.error(`Error reading file ${filePath}:`, error);
      throw error;
    }
  });

  // Handle reading multiple files
  ipcMain.handle('fs:readMultipleFiles', async (_, paths: string[], options?: { encoding?: BufferEncoding }) => {
    try {
      const unixPaths = paths.map(p => _fileService.toUnix(p));
      const resultMap = await _fileService.readMultiple(unixPaths, options);
      // Maps aren't serializable over IPC, convert to Array of tuples or Object
      // Object is easier for JS/TS consumption: Record<string, string | Buffer | null>
      return Object.fromEntries(resultMap);
    } catch (error) {
      handleError(error, `batch reading files`);
    }
  });

  // Handle writing file contents
  ipcMain.handle('fs:writeFile', async (_, filePath: string, data: string) => {
    try {
      // Normalize to Unix format
      const unix = _fileService.toUnix(filePath);
      
      // Only relativize if absolute AND inside base directory
      const pathForFs = 
        PathUtils.isAbsolute(unix) && PathUtils.isPathInside(_fileService.getBaseDir(), unix)
          ? _fileService.relativize(unix)
          : unix;  // absolute path outside project or already relative, use as-is

      await _fileService.write(pathForFs, data);
      return true;
    } catch (error) {
      handleError(error, `writing file ${filePath}`);
    }
  });

  // Handle appending file contents
  ipcMain.handle('fs:appendFile', async (_, filePath: string, data: string) => {
    try {
      // Normalize to Unix format
      const unix = _fileService.toUnix(filePath);
      
      // Only relativize if absolute AND inside base directory
      const pathForFs = 
        PathUtils.isAbsolute(unix) && PathUtils.isPathInside(_fileService.getBaseDir(), unix)
          ? _fileService.relativize(unix)
          : unix;

      await _fileService.append(pathForFs, data);
      return true;
    } catch (error) {
      handleError(error, `appending to file ${filePath}`);
    }
  });

  // Handle prepending file contents
  ipcMain.handle('fs:prependFile', async (_, filePath: string, data: string) => {
    try {
      // Normalize to Unix format
      const unix = _fileService.toUnix(filePath);
      
      // Only relativize if absolute AND inside base directory
      const pathForFs = 
        PathUtils.isAbsolute(unix) && PathUtils.isPathInside(_fileService.getBaseDir(), unix)
          ? _fileService.relativize(unix)
          : unix;

      await _fileService.prepend(pathForFs, data);
      return true;
    } catch (error) {
      handleError(error, `prepending to file ${filePath}`);
    }
  });

  // Handle deleting files
  ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
    try {
      // Normalize to Unix format
      const unix = _fileService.toUnix(filePath);
      
      // Only relativize if absolute AND inside base directory
      const pathForFs = 
        PathUtils.isAbsolute(unix) && PathUtils.isPathInside(_fileService.getBaseDir(), unix)
          ? _fileService.relativize(unix)
          : unix;  // absolute path outside project or already relative, use as-is

      await _fileService.remove(pathForFs);
      return true;
    } catch (error) {
      handleError(error, `deleting file ${filePath}`);
    }
  });

  // Handle renaming/moving files
  ipcMain.handle('fs:renameFile', async (_, oldPath: string, newPath: string) => {
    try {
      // Normalize both paths to Unix format
      const oldUnix = _fileService.toUnix(oldPath);
      const newUnix = _fileService.toUnix(newPath);
      
      // Relativize if they are inside the base directory
      const oldPathForFs = PathUtils.isAbsolute(oldUnix) && PathUtils.isPathInside(_fileService.getBaseDir(), oldUnix)
          ? _fileService.relativize(oldUnix)
          : oldUnix;
      const newPathForFs = PathUtils.isAbsolute(newUnix) && PathUtils.isPathInside(_fileService.getBaseDir(), newUnix)
          ? _fileService.relativize(newUnix)
          : newUnix;

      await _fileService.rename(oldPathForFs, newPathForFs);
      return true;
    } catch (error) {
      handleError(error, `renaming file from ${oldPath} to ${newPath}`);
    }
  });

  // Handle ensuring a directory exists
  ipcMain.handle('fs:ensureDirectory', async (_, dirPath: string) => {
    try {
      const pathForFs = _fileService.toUnix(dirPath); // Normalize
      await _fileService.ensureDir(pathForFs);
      return true;
    } catch (error) {
      handleError(error, `ensuring directory ${dirPath}`);
    }
  });

  // Handle getting file tree
  ipcMain.handle('fs:getFileTree', async (_, dirPath: string) => {
    try {
      const pathForFs = _fileService.toUnix(dirPath); // Normalize
      const tree = await _fileService.getFileTree(pathForFs);
      return tree;
    } catch (error) {
      handleError(error, `getting file tree for ${dirPath}`);
    }
  });

  // Handle checking if file exists
}

// Enhanced error handling
function handleError(error: unknown, operation: string): never {
  console.error(`Error during ${operation}:`, error);
  throw error instanceof Error ? error : new Error(String(error));
}
