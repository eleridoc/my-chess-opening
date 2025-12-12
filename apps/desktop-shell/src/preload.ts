// apps/desktop-shell/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
	ping: async () => {
		return ipcRenderer.invoke('ping');
	},
});
