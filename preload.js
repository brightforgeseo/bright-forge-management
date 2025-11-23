const { contextBridge, ipcRenderer } = require('electron');

// Expose electron APIs to the renderer process securely
contextBridge.exposeInMainWorld('electronAPI', {
  // Show native OS notification
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body });
  },
  // Focus the main window (useful when notification is clicked)
  focusWindow: () => {
    ipcRenderer.send('focus-window');
  }
});
