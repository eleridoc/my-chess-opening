import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
	ping: async () => {
		return ipcRenderer.invoke('ping');
	},

	setup: {
		getState: async () => {
			return ipcRenderer.invoke('setup:getState');
		},
		saveAccounts: async (input: {
			lichessUsername?: string | null;
			chesscomUsername?: string | null;
		}) => {
			return ipcRenderer.invoke('setup:saveAccounts', input);
		},
	},
});
