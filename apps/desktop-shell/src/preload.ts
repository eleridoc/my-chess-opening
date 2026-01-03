import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronApi, SaveAccountsInput } from 'my-chess-opening-shared';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
	return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api: ElectronApi = {
	ping: () => invoke<{ message: string; core: string }>('ping'),

	setup: {
		getState: () => invoke('setup:getState'),
		saveAccounts: (input: SaveAccountsInput) => invoke('setup:saveAccounts', input),
	},
};

contextBridge.exposeInMainWorld('electron', api);
