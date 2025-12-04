import { ipcMain } from 'electron';
import { FileService } from '../services/FileService';
import { PathUtils } from '../services/PathUtils';

// Store fileService instance
let _fileService: FileService;
// Store active unsubscribe functions by watcher path
const unsubscribeFunctions = new Map<string, () => void>();

export function setupFileWatchHandlers(fileService: FileService) {
  // Store the fileService instance for later use
  _fileService = fileService;

  // Handle directory watching with ignore rules
  ipcMain.handle('fs:watch', (event, dirPath: string) => {
    try {
      // Normalize to Unix format
      const unix = _fileService.toUnix(dirPath);
      
      // Only relativize if absolute AND inside base directory
      const pathForFs = 
        PathUtils.isAbsolute(unix) && PathUtils.isPathInside(_fileService.getBaseDir(), unix)
          ? _fileService.relativize(unix)
          : unix;  // absolute path outside project or already relative, use as-is
      
      // Generate a consistent key for this watcher
      const watcherKey = pathForFs;
      
      console.log(`Setting up watcher for: ${pathForFs}`);

      // Clean up existing watcher if any
      if (unsubscribeFunctions.has(watcherKey)) {
        unsubscribeFunctions.get(watcherKey)?.();
        unsubscribeFunctions.delete(watcherKey);
        console.log(`Cleaned up existing watcher for: ${watcherKey}`);
      }

      // Debounce timer for this watcher
      let debounceTimer: NodeJS.Timeout | null = null;

      // Set up new watcher with FileService
      const unsubscribeWatcher = _fileService.watch(pathForFs, (eventName, filePath) => {
        if (event.sender.isDestroyed()) return;

        // Clear existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // Set new timer to debounce IPC events
        // We use a short delay (100ms) to batch rapid file system changes (like git checkout or npm install)
        // into fewer IPC messages, while keeping the UI responsive.
        debounceTimer = setTimeout(() => {
          if (!event.sender.isDestroyed()) {
            // Forward the last event to the renderer process
            // The renderer refreshes the whole tree anyway, so one event is sufficient to trigger it
            event.sender.send('fs:change', eventName, filePath);
          }
          debounceTimer = null;
        }, 100);
      });

      // Create a wrapper unsubscribe function that also clears the timer
      const unsubscribe = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        unsubscribeWatcher();
      };

      // Store the unsubscribe function
      unsubscribeFunctions.set(watcherKey, unsubscribe);
      
      console.log(`Watcher established for: ${watcherKey}`);
      return true;
    } catch (error) {
      console.error('Error setting up file watcher:', error);
      
      // Notify renderer of the error
      if (!event.sender.isDestroyed()) {
        event.sender.send(
          'fs:error',
          error instanceof Error ? error.message : 'Unknown watcher error'
        );
      }
      
      throw error;
    }
  });

  // Cleanup all watchers when requested
  ipcMain.handle('fs:cleanupWatchers', () => {
    try {
      // Call all unsubscribe functions
      for (const [key, unsubscribe] of unsubscribeFunctions.entries()) {
        unsubscribe();
        console.log(`Cleaned up watcher for: ${key}`);
      }
      
      // Clear the map
      unsubscribeFunctions.clear();
      return true;
    } catch (error) {
      console.error('Error cleaning up watchers:', error);
      throw error;
    }
  });
}
