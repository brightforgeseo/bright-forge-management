const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

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
  },
  // Get screen sources for screen sharing
  getScreenSources: async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      });
      // Return serializable data (thumbnails as data URLs)
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (error) {
      console.error('[Preload] Error getting screen sources:', error);
      return [];
    }
  }
});
