export const ipcMain = {};
export const app = { isPackaged: false, getAppPath: () => '/fake/app' };
export const dialog = {
  showErrorBox: () => {},
  showMessageBox: () => Promise.resolve({ response: 0 }), // 0 for 'OK'
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
};
export const BrowserWindow = function () {};
// add tiny stubs only as you need them
