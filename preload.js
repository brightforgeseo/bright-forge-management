const { contextBridge, ipcRenderer } = require('electron');

// Expose electron APIs to the renderer process securely
contextBridge.exposeInMainWorld('electronAPI', {
  // Show native OS notification using web Notification API (works without code signing)
  showNotification: (title, body) => {
    // Use web Notification API - works on macOS without code signing
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        silent: false
      });
      notification.onclick = () => {
        ipcRenderer.send('focus-window');
      };
    } else if (Notification.permission !== 'denied') {
      // Request permission first
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          const notification = new Notification(title, {
            body: body,
            silent: false
          });
          notification.onclick = () => {
            ipcRenderer.send('focus-window');
          };
        }
      });
    }
  },
  // Focus the main window (useful when notification is clicked)
  focusWindow: () => {
    ipcRenderer.send('focus-window');
  }
});
