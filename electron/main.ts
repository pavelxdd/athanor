import { app, BrowserWindow, Menu, nativeTheme, ipcMain } from 'electron';
import fixPath from 'fix-path';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { createWindow, mainWindow, getIconPath } from './windowManager';
import { setupIpcHandlers } from './ipcHandlers';

declare const GIT_VERSION: string;

import { FileService } from './services/FileService';
import { SettingsService } from './services/SettingsService';
import { GitService } from './services/GitService';
import type { ApplicationSettings } from '../src/types/global';

// --- WSL Graphics Fix Start ---
// This addresses a specific rendering issue on WSL where Electron may default
// to an incompatible graphics backend, causing a blank screen.
// By checking for a custom environment variable, we allow affected users to opt-in
// to forcing the 'desktop' OpenGL backend without affecting other users.
if (process.env.ELECTRON_USE_DESKTOP_GL === '1') {
  console.log(
    '[Main] ELECTRON_USE_DESKTOP_GL=1 detected. Applying --use-gl=desktop switch.'
  );
  app.commandLine.appendSwitch('use-gl', 'desktop');
}
// --- WSL Graphics Fix End ---

// Debug flag for menu diagnostics
const DEBUG_MENU = false;
const DEBUG_PATH = false;

// Cached package.json content for menu and about panel
let cachedPackageJson: any = null;

// Adjusts PATH in packaged Electron app to match the shell PATH
if (DEBUG_PATH) {
  console.log('[Main] PATH before fix-path:', process.env.PATH);
  console.log('[Main] SHELL before fix-path:', process.env.SHELL);
}
fixPath();
if (DEBUG_PATH) {
  console.log('[Main] PATH after fix-path:', process.env.PATH);
  console.log('[Main] SHELL after fix-path:', process.env.SHELL);
}

// Create singleton instances
export const fileService = new FileService();
export const settingsService = new SettingsService(fileService);
export const gitService = new GitService(fileService.getBaseDir());

// Get the base directory of the Athanor application
export function getAppBasePath(): string {
  return app.getAppPath();
}

// Function to create a new instance of the application
function createNewInstance(projectPath?: string) {
  const args = projectPath ? [projectPath] : [];
  // Using spawn is more reliable across platforms than `open -n`
  spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

// Dynamic menu builder function
async function buildMenu() {
  try {
    const appSettings = await settingsService.getApplicationSettings();
    const recentProjects = appSettings?.recentProjectPaths || [];

    const recentProjectsMenu: Electron.MenuItemConstructorOptions[] =
      recentProjects.length > 0
        ? recentProjects.map((projectPath) => ({
            label: projectPath,
            click: () => {
              // Find the window that is currently focused to send the command to.
              // This is more robust than using the event's browserWindow which had type issues.
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.webContents.send('menu:open-path', projectPath);
              }
            },
          }))
        : [{ label: 'No Recent Projects', enabled: false }];

    // Read package.json for About panel information (use cache if available)
    let packageJson = cachedPackageJson;
    if (!packageJson) {
      const packageJsonPath = path.join(app.getAppPath(), 'package.json');
      const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf8');
      packageJson = JSON.parse(packageJsonContent);
    }

    // Create application menu template
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      // macOS app menu
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.getName(),
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ] as Electron.MenuItemConstructorOptions[],
            },
          ]
        : []),
      // File menu
      {
        label: 'File',
        submenu: [
          {
            label: 'New Instance',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => {
              createNewInstance();
            },
          },
          { type: 'separator' as const },
          {
            label: 'Open Folder...',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              mainWindow?.webContents.send('menu:open-folder');
            },
          },
          { type: 'separator' as const },
          {
            label: 'Open Recent',
            submenu: recentProjectsMenu,
          },
          { type: 'separator' as const },
          process.platform === 'darwin'
            ? { role: 'close' as const }
            : { role: 'quit' as const },
        ],
      },
      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' as const },
          { role: 'redo' as const },
          { type: 'separator' as const },
          { role: 'cut' as const },
          { role: 'copy' as const },
          { role: 'paste' as const },
          ...(process.platform === 'darwin'
            ? [
                { role: 'pasteAndMatchStyle' as const },
                { role: 'delete' as const },
                { role: 'selectAll' as const },
                { type: 'separator' as const },
                {
                  label: 'Speech',
                  submenu: [
                    { role: 'startSpeaking' as const },
                    { role: 'stopSpeaking' as const },
                  ],
                },
              ]
            : [
                { role: 'delete' as const },
                { type: 'separator' as const },
                { role: 'selectAll' as const },
              ]),
        ],
      },
      // View menu
      {
        label: 'View',
        submenu: [
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },
      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' as const },
          { role: 'zoom' as const },
          ...(process.platform === 'darwin'
            ? [
                { type: 'separator' as const },
                { role: 'front' as const },
                { type: 'separator' as const },
                { role: 'window' as const },
              ]
            : [{ role: 'close' as const }]),
        ],
      },
      // Help menu
      {
        role: 'help' as const,
        submenu: [
          {
            label: `About ${packageJson.name.charAt(0).toUpperCase() + packageJson.name.slice(1)}`,
            role: 'about' as const,
          },
        ],
      },
    ];

    // Log the template object to inspect its structure.
    if (DEBUG_MENU) {
      console.log(
        '[DIAGNOSTIC] Final menu template object:',
        JSON.stringify(menuTemplate, null, 2)
      );
    }

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    // Confirm this line was executed.
    if (DEBUG_MENU) {
      console.log(
        '[DIAGNOSTIC] Menu.setApplicationMenu() was called successfully.'
      );
    }
  } catch (error) {
    console.error('Error building menu:', error);
  }
}

// App lifecycle handlers
app.whenReady().then(async () => {
  // Fix macOS development dock icon
  if (process.platform === 'darwin' && !app.isPackaged) {
    const icon = getIconPath();
    // The call is synchronous, but the error it triggers is an unhandled async rejection later.
    // A try/catch here is good practice but won't solve the main issue.
    try {
      if (app.dock) {
        app.dock.setIcon(icon);
      }
    } catch (e) {
      console.error('Synchronous error setting dock icon:', e);
    }
  }

  // Set up custom dock menu for macOS
  if (process.platform === 'darwin' && app.dock) {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'New Instance',
        click: () => createNewInstance(),
      },
    ]);
    app.dock.setMenu(dockMenu);
  }

  // Handle CLI argument for opening a project
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  const potentialPath = args.find((arg) => !arg.startsWith('-'));

  if (potentialPath) {
    const absolutePath = path.resolve(potentialPath);
    try {
      // Use fileService to check if the path is a valid directory
      if (await fileService.isDirectory(absolutePath)) {
        fileService.cliPath = fileService.toUnix(absolutePath);
        console.log(
          `[Athanor] CLI project path specified: ${fileService.cliPath}`
        );
      } else {
        console.warn(
          `[Athanor] CLI path is not a directory, ignoring: ${absolutePath}`
        );
      }
    } catch (error) {
      // This can happen if the path does not exist at all
      console.warn(
        `[Athanor] Invalid CLI path provided, ignoring: ${absolutePath}`,
        error
      );
    }
  }
  // Listen for base directory changes to trigger project-wide analysis
  fileService.on('base-dir-changed', async () => {
    // Update GitService base directory when project changes to fix state sync bug
    gitService.setBaseDir(fileService.getBaseDir());
  });

  setupIpcHandlers(
    fileService,
    settingsService,
    gitService
  );

  // Read package.json for About panel information
  const packageJsonPath = path.join(app.getAppPath(), 'package.json');
  const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf8');
  cachedPackageJson = JSON.parse(packageJsonContent);

  // Configure About panel
  app.setAboutPanelOptions({
    applicationName:
      cachedPackageJson.name.charAt(0).toUpperCase() + cachedPackageJson.name.slice(1),
    applicationVersion: `Version ${GIT_VERSION}`,
    authors: [cachedPackageJson.author],
    copyright: `Copyright © ${new Date().getFullYear()} ${cachedPackageJson.author}`,
    credits: `${cachedPackageJson.description}`,
  });

  // Set up menu rebuild listener and build initial menu
  ipcMain.on('app:rebuild-menu', buildMenu);
  await buildMenu();

  await createWindow();

  // Listen for system theme changes and notify renderer
  nativeTheme.on('updated', () => {
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(
        'native-theme-updated',
        nativeTheme.shouldUseDarkColors
      );
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  console.log('App initialization completed successfully.');
});

app.on('window-all-closed', () => {
  fileService.cleanupWatchers().catch((err) => {
    console.error('Error cleaning up FileService watchers:', err);
  });

  // Quit on all windows closed, including macOS
  app.quit();
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Attempt to send error to renderer if window exists
  if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('fs:error', String(error));
  }
});
