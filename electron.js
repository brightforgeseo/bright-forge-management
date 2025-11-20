
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Determine if we are in development mode
const isDev = !app.isPackaged;

function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Bright Forge Portal",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // This allows us to use the camera/mic if needed
      mediaHandlers: true, 
    },
    autoHideMenuBar: true, // Hides the file menu on Windows/Linux for a cleaner look
  });

  // In development, load the local server
  // In production, load the build file
  if (isDev) {
    win.loadURL('http://localhost:1234'); // Assuming Parcel/Vite uses port 1234
    // Open DevTools in development
    // win.webContents.openDevTools();
  } else {
    // In production, load the index.html from the build folder
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Handle external links (don't open them inside the app, open in default browser)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

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
