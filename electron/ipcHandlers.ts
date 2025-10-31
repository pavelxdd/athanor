import { setupCoreHandlers } from './handlers/coreHandlers';
import { setupFileOperationHandlers } from './handlers/fileOperationHandlers';
import { setupFileWatchHandlers } from './handlers/fileWatchHandlers';
import { setupSettingsHandlers } from './handlers/settingsHandlers';
import { setupGitHandlers } from './handlers/gitHandlers';
import { FileService } from './services/FileService';
import { SettingsService } from './services/SettingsService';
import { GitService } from './services/GitService';

export function setupIpcHandlers(
  fileService: FileService,
  settingsService: SettingsService,
  gitService: GitService
) {
  setupCoreHandlers(fileService, settingsService, gitService);
  setupFileOperationHandlers(fileService);
  setupFileWatchHandlers(fileService);
  setupSettingsHandlers(settingsService);
  setupGitHandlers(gitService, fileService);
}
