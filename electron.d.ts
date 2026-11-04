// Type declarations for Electron preload API
interface ElectronAPI {
  prepareArtifactSave?: (payload: {id:string;owner:string;name:string;mime:string;bytes:number;sha256:string;data:Uint8Array}) => Promise<{status:'prepared'|'cancelled';claim?:string}>;
  commitArtifactSave?: (payload: {claim:string;id:string;owner:string;name:string;mime:string;bytes:number;sha256:string}) => Promise<{status:'saved';bytes:number;sha256:string}>;
  cancelArtifactSave?: (payload: {claim:string}) => Promise<{status:'cancelled'}>;
  showNotification: (title: string, body: string, destination?: { userId: string; linkView?: string; linkData?: any }) => void;
  onNotificationClick: (handler: (destination: { userId: string; linkView?: string; linkData?: any }) => void) => () => void;
  focusWindow: () => void;
  clearNotifications: () => void;
  getNotificationStatus: () => Promise<{supported:boolean; permission:'unknown'; requiresRunningApp:true; closedAppPush:false}>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
