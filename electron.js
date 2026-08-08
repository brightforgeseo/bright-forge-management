
const { app, BrowserWindow, shell, ipcMain, dialog, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Bazzite's Electron GPU child can crash repeatedly under the current driver
// stack, which terminates the whole desktop portal. The portal is a business
// dashboard, so favour a stable software-rendered UI over GPU acceleration.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
}

const appIconPath = process.platform === 'win32'
  ? path.join(__dirname, 'assets', 'icon.ico')
  : path.join(__dirname, 'assets', 'icon.png');

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
      if (fs.existsSync(appIconPath)) {
        notificationOptions.icon = appIconPath;
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
// Team builds are published to GitHub Releases. Download updates silently so users
// do not miss critical fixes just because they dismissed an "update available" box.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
// Disable code signing verification for unsigned builds (required for Mac without Apple Developer cert)
if (process.platform === 'darwin') {
  autoUpdater.forceCodeSigning = false;
}

let mainWindow;

// Remember window size/position between sessions
const windowStateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(require('fs').readFileSync(windowStateFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveWindowState() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const state = { ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() };
    require('fs').writeFileSync(windowStateFile(), JSON.stringify(state));
  } catch {
    // Losing window state is not worth an error dialog.
  }
}

function createWindow() {
  const state = loadWindowState();

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: state.width || 1280,
    height: state.height || 800,
    x: state.x,
    y: state.y,
    title: "Bright Forge Portal",
    icon: appIconPath,
    // Match the portal theme and wait for content so launch doesn't flash white
    backgroundColor: '#0d0f1a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // This allows us to use the camera/mic if needed
      mediaHandlers: true,
    },
    autoHideMenuBar: true, // Hides the file menu on Windows/Linux for a cleaner look
  });

  mainWindow.once('ready-to-show', () => {
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('close', saveWindowState);

  // In development, load the local server
  // In production, load the build file
  if (isDev) {
    mainWindow.loadURL('http://localhost:1234'); // Assuming Parcel/Vite uses port 1234
    // Open DevTools in development
    // mainWindow.webContents.openDevTools();
  } else {
    // All desktop installations use the Tailnet portal server. This keeps each
    // team member on the shared live database rather than trying localhost.
    mainWindow.loadURL(process.env.BRIGHTFORGE_PORTAL_URL || 'http://bazzite:8080');
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
  console.log('Update available, downloading silently:', info);

  if (process.platform === 'darwin') {
    console.log('Skipping update download on Mac - code signing required for auto-updates');
    return;
  }

  // autoDownload=true handles the download. Keep this silent so the whole team
  // gets the update without needing to click an "available" prompt first.
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

  // Update checks must never interrupt portal use. If GitHub/network/signing fails,
  // log it and let the next hourly check or installer release handle it.
  console.log('Skipping update error dialog:', err && (err.message || err));
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

// Only one portal instance: launching again focuses the existing window
// (prevents duplicate notification/presence sessions).
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // Linux builds are local AppImages until a signed Linux release channel is published.
  // Do not run the GitHub updater there, it produces rejected update promises without
  // affecting the portal itself. Windows remains on the established release channel.
  if (!isDev && process.platform === 'win32') {
    autoUpdater.checkForUpdates();

    // Check every 15 minutes so releases reach the team quickly
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 15 * 60 * 1000);

    // Also check when the user comes back to the app, so long-running
    // instances pick up releases as soon as someone looks at the portal.
    let lastFocusCheck = 0;
    app.on('browser-window-focus', () => {
      if (Date.now() - lastFocusCheck < 5 * 60 * 1000) return;
      lastFocusCheck = Date.now();
      autoUpdater.checkForUpdates();
    });
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
