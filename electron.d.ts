// Type declarations for Electron preload API
interface ElectronAPI {
  showNotification: (title: string, body: string, destination?: { userId: string; linkView?: string; linkData?: any }) => void;
  onNotificationClick: (handler: (destination: { userId: string; linkView?: string; linkData?: any }) => void) => () => void;
  focusWindow: () => void;
  clearNotifications: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
