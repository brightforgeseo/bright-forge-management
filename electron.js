
const { app, BrowserWindow, shell, ipcMain, dialog, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Set App User Model ID for Windows notifications
// Must match the appId in electron-builder config for proper Windows integration
if (process.platform === 'win32') {
  app.setAppUserModelId('com.brightforge.portal');
}

// Helper function to show native OS notification
function showNativeNotification(title, body) {
  console.log('[Notification] Attempting to show notification:', { title, body, supported: Notification.isSupported() });

  if (Notification.isSupported()) {
    try {
      // Build notification options
      const notificationOptions = {
        title: title,
        body: body,
        silent: false
      };

      // Add icon if it exists (for Windows/Linux - macOS uses app icon automatically)
      const fs = require('fs');
      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      if (fs.existsSync(iconPath)) {
        notificationOptions.icon = iconPath;
      }

      const notification = new Notification(notificationOptions);

      notification.on('click', () => {
        // Focus the main window when notification is clicked
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });

      notification.on('show', () => {
        console.log('[Notification] Notification shown successfully');
        // Bounce dock icon on macOS, flash taskbar on Windows
        if (process.platform === 'darwin') {
          app.dock.bounce('informational');
        } else if (mainWindow) {
          mainWindow.flashFrame(true);
        }
      });

      notification.on('failed', (_, error) => {
        console.error('[Notification] Failed to show notification:', error);
      });

      notification.show();
    } catch (err) {
      console.error('[Notification] Error creating notification:', err);
    }
  } else {
    console.warn('[Notification] Notifications not supported on this platform');
  }
}

// Determine if we are in development mode
const isDev = !app.isPackaged;

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
// Disable code signing verification for unsigned builds (required for Mac without Apple Developer cert)
if (process.platform === 'darwin') {
  autoUpdater.forceCodeSigning = false;
}

let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Bright Forge Portal",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // This allows us to use the camera/mic if needed
      mediaHandlers: true,
    },
    autoHideMenuBar: true, // Hides the file menu on Windows/Linux for a cleaner look
  });

  // In development, load the local server
  // In production, load the build file
  if (isDev) {
    mainWindow.loadURL('http://localhost:1234'); // Assuming Parcel/Vite uses port 1234
    // Open DevTools in development
    // mainWindow.webContents.openDevTools();
  } else {
    // In production, load the index.html from the build folder
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Handle external links (don't open them inside the app, open in default browser)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return mainWindow;
}

// Auto-updater event handlers (only active on Windows - Mac is disabled due to code signing requirement)
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);

  // Skip on Mac - auto-update doesn't work without code signing
  if (process.platform === 'darwin') {
    console.log('Skipping update dialog on Mac - code signing required for auto-updates');
    return;
  }

  // Show notification that update is available
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available!',
    detail: `Version ${info.version} is now available. It will be downloaded in the background.`,
    buttons: ['OK']
  });

  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info);

  // Prompt user to restart and install
  const response = dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded!',
    detail: 'A new version has been downloaded. Restart the app to install the update.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  });

  if (response === 0) {
    // User clicked "Restart Now"
    // Force quit without waiting for app to close gracefully (needed for unsigned Mac apps)
    autoUpdater.quitAndInstall(false, true);
  }
});

autoUpdater.on('error', (err) => {
  console.log('Auto-update error:', err);

  // Never show update errors on Mac - auto-update is disabled anyway
  if (process.platform === 'darwin') {
    console.log('Skipping update error on Mac - auto-updates disabled');
    return;
  }

  // Don't show dialog for code signature errors (happens in dev/unsigned builds)
  // Also catch related errors like "Cannot find latest.yml" or signature verification failures
  const ignoredErrors = ['code signature', 'Code signature', 'ENOENT', 'ERR_UPDATER_INVALID_RELEASE', 'Could not get code signature'];
  if (err.message && ignoredErrors.some(e => err.message.includes(e))) {
    console.log('Skipping update error notification - likely unsigned build issue');
    return;
  }

  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Update Error',
    message: 'Error checking for updates',
    detail: err.message,
    buttons: ['OK']
  });
});

// IPC handlers for renderer process communication
ipcMain.on('show-notification', (event, { title, body }) => {
  showNativeNotification(title, body);
});

ipcMain.on('focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // Check for updates only in production (disabled on Mac until app is code signed)
  if (!isDev && process.platform !== 'darwin') {
    autoUpdater.checkForUpdatesAndNotify();

    // Check for updates every hour
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
