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
	AccountsListResult,
	AccountsSetEnabledResult,
	AccountsDeleteResult,
	AccountsCreateResult,
} from 'my-chess-opening-core';

/**
 * Strongly-typed wrapper around ipcRenderer.invoke().
 *
 * Notes:
 * - Keep this helper minimal: preload is part of the security boundary.
 * - Do not expose ipcRenderer directly to the renderer.
 */
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
	return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

type PingResult = { message: string; core: string };
type OkTrue = { ok: true };

/**
 * `ElectronApi` implementation exposed to the renderer as `window.electron`.
 * This must stay aligned with the contract defined in `core/src/ipc/api.ts`.
 */
const api: ElectronApi = {
	ping: () => invoke<PingResult>('ping'),

	setup: {
		getState: () => invoke('setup:getState'),
		saveAccounts: (input: SaveAccountsInput) => invoke<OkTrue>('setup:saveAccounts', input),
	},

	import: {
		// Normalize optional input to a plain object for IPC payload stability.
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
		list: (input?: GamesListInput) => invoke('games:list', input ?? {}),
	},

	system: {
		openExternal: (url: string) => invoke<OkTrue>('system:openExternal', url),
	},

	accounts: {
		list: () => invoke<AccountsListResult>('accounts:list'),
		setEnabled: (accountId: string, isEnabled: boolean) =>
			invoke<AccountsSetEnabledResult>('accounts:setEnabled', { accountId, isEnabled }),
		delete: (accountId: string) =>
			invoke<AccountsDeleteResult>('accounts:delete', { accountId }),
		create: (site, username) =>
			invoke<AccountsCreateResult>('accounts:create', { site, username }),
	},
};

// Expose a single, curated API surface to the renderer process.
contextBridge.exposeInMainWorld('electron', api);
