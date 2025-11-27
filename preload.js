const { contextBridge, ipcRenderer } = require('electron');

// Expose electron APIs to the renderer process securely
contextBridge.exposeInMainWorld('electronAPI', {
  // Show native OS notification via main process (proper Windows/Mac notification cards)
  showNotification: (title, body) => {
    console.log('[Preload] Sending notification to main process:', title);
    ipcRenderer.send('show-notification', { title, body });
  },
  // Focus the main window (useful when notification is clicked)
  focusWindow: () => {
    ipcRenderer.send('focus-window');
  }
});
