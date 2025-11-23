// Type declarations for Electron preload API
interface ElectronAPI {
  showNotification: (title: string, body: string) => void;
  focusWindow: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
