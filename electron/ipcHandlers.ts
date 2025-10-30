import { ipcMain } from 'electron';
import { mainWindow } from './windowManager';
import { setupCoreHandlers } from './handlers/coreHandlers';
import { setupFileOperationHandlers } from './handlers/fileOperationHandlers';
import { setupFileWatchHandlers } from './handlers/fileWatchHandlers';
import { setupSettingsHandlers } from './handlers/settingsHandlers';
import { setupContextHandlers } from './handlers/contextHandlers';
import { setupGitHandlers } from './handlers/gitHandlers';
import { FileService } from './services/FileService';
import { SettingsService } from './services/SettingsService';
import { GitService } from './services/GitService';
import { RelevanceEngineService } from './services/RelevanceEngineService';
import { ProjectGraphService } from './services/ProjectGraphService';
import { UserActivityService } from './services/UserActivityService';

export function setupIpcHandlers(
  fileService: FileService,
  settingsService: SettingsService,
  relevanceEngine: RelevanceEngineService,
  projectGraphService: ProjectGraphService,
  userActivityService: UserActivityService,
  gitService: GitService
) {
  setupCoreHandlers(fileService, settingsService, gitService);
  setupFileOperationHandlers(fileService);
  setupFileWatchHandlers(fileService);
  setupSettingsHandlers(settingsService);
  setupContextHandlers(relevanceEngine, settingsService);
  setupGitHandlers(gitService, fileService);
}
