import { BrowserWindow, app, screen } from 'electron';
import * as path from 'path';
import { settingsService } from './main';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const isDev = process.env.NODE_ENV === 'development';

export let mainWindow: BrowserWindow | null = null;

/**
 * Gets the correct path to the application icon for the current platform.
 * This works in both development and packaged modes.
 */
export function getIconPath(): string {
  // Select the correct icon file based on the OS
  const platform = process.platform;
  let iconName: string;
  if (platform === 'win32') {
    iconName = 'athanor.ico';
  } else if (platform === 'darwin') {
    iconName = app.isPackaged ? 'athanor.icns' : 'athanor.png';
  } else {
    // Linux and others
    iconName = 'athanor.png';
  }

  // The path logic depends on whether the app is packaged.
  // This is the key change to make the packaged version work.
  if (app.isPackaged) {
    // In a packaged app, `extraResource` copies the `assets` directory into `process.resourcesPath`.
    return path.join(process.resourcesPath, 'assets', iconName);
  } else {
    // In development, `app.getAppPath()` points to the project root.
    return path.join(app.getAppPath(), 'assets', iconName);
  }
}

export async function createWindow() {

  // Create the browser window options
  const browserWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    x: 100, 
    y: 100,
    // Use the universal function to set the icon for all cases.
    icon: getIconPath(),
    show: false, // Create window hidden to prevent white flash
    backgroundColor: '#1f2937', // Dark background matching dark:bg-gray-800
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  };

  // Create the browser window
  mainWindow = new BrowserWindow(browserWindowOptions);

  // Show window gracefully when it's ready
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // Set maximized state
  mainWindow.maximize();

  // Load the app
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools automatically in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window failures
  mainWindow.webContents.on(
    'did-fail-load',
    (_, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
    }
  );

  // Cleanup on window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
