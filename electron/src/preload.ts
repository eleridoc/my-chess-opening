// electron/src/preload.ts

import { contextBridge, ipcRenderer } from 'electron';
import type {
	ElectronApi,
	SaveAccountsInput,
	ImportRunNowInput,
	ExplorerGetGameResult,
	LogsListInput,
	LogsListResult,
	LogEntryDetails,
	LogsFacetsResult,
	GamesListInput,
	GamesListResult,
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
	explorer: {
		getGame: (gameId: string) => invoke<ExplorerGetGameResult>('explorer:getGame', gameId),
	},
	games: {
		list: (input?: GamesListInput) => invoke<GamesListResult>('games:list', input ?? {}),
	},
	system: {
		openExternal: (url: string) => invoke<{ ok: true }>('system:openExternal', url),
	},
};

contextBridge.exposeInMainWorld('electron', api);
