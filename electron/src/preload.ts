// electron/src/preload.ts

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronApi, SaveAccountsInput, ImportRunNowInput } from 'my-chess-opening-core';
import type {
	LogsListInput,
	LogsListResult,
	LogEntryDetails,
	LogsFacetsResult,
} from 'my-chess-opening-core';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
	return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api: ElectronApi = {
	ping: () => invoke<{ message: string; core: string }>('ping'),

	setup: {
		getState: () => invoke('setup:getState'),
		saveAccounts: (input: SaveAccountsInput) => invoke('setup:saveAccounts', input),
	},

	import: {
		runNow: (input?: ImportRunNowInput) => invoke('import:runNow', input ?? {}),
	},

	logs: {
		list: (input?: LogsListInput) => invoke<LogsListResult>('logs:list', input ?? {}),
		getEntry: (id: string) => invoke<LogEntryDetails | null>('logs:getEntry', id),
		facets: () => invoke<LogsFacetsResult>('logs:facets'),
	},
};

contextBridge.exposeInMainWorld('electron', api);
