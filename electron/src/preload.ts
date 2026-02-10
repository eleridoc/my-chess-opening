// electron/src/preload.ts

import { contextBridge, ipcRenderer } from 'electron';
import type {
	ElectronApi,
	ExplorerGetGameResult,
	LogsListInput,
	LogsListResult,
	LogEntryDetails,
	LogsFacetsResult,
	GamesListInput,
	GamesListResult,
	AccountsListResult,
	AccountsSetEnabledResult,
	AccountsDeleteResult,
	AccountsCreateResult,
	ImportStartInput,
	ImportStartResult,
	ImportEvent,
	ImportEventListener,
	ImportEventSubscriptionId,
} from 'my-chess-opening-core';

/**
 * Strongly-typed wrapper around ipcRenderer.invoke().
 *
 * Notes:
 * - Keep this helper minimal: preload is part of the security boundary.
 * - Do not expose ipcRenderer directly to the renderer.
 * - Prefer explicit channels (string literals) over dynamic channel names.
 */
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
	return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

/**
 * Centralized channel names used by preload.
 * Keeping them in one place helps prevent typos and accidental channel drift.
 */
const CHANNELS = {
	PING: 'ping',
	IMPORT_START: 'import:start',
	IMPORT_EVENT: 'import:event',
	LOGS_LIST: 'logs:list',
	LOGS_GET_ENTRY: 'logs:getEntry',
	LOGS_FACETS: 'logs:facets',
	EXPLORER_GET_GAME: 'explorer:getGame',
	GAMES_LIST: 'games:list',
	SYSTEM_OPEN_EXTERNAL: 'system:openExternal',
	ACCOUNTS_LIST: 'accounts:list',
	ACCOUNTS_SET_ENABLED: 'accounts:setEnabled',
	ACCOUNTS_DELETE: 'accounts:delete',
	ACCOUNTS_CREATE: 'accounts:create',
} as const;

/**
 * Import event fan-out:
 * - Electron main emits a single stream on CHANNELS.IMPORT_EVENT.
 * - Preload distributes the payload to subscribed renderer listeners.
 *
 * Why here:
 * - Renderer never touches ipcRenderer directly.
 * - We keep the subscription mechanism fully local to preload.
 */
const importEventListeners = new Map<ImportEventSubscriptionId, ImportEventListener>();
let importEventSubSeq = 0;

/**
 * One-time bridge: listen to Electron events and notify registered listeners.
 *
 * Best-effort:
 * - Listener failures are isolated and do not break the event loop.
 */
ipcRenderer.on(CHANNELS.IMPORT_EVENT, (_event, payload: ImportEvent) => {
	if (importEventListeners.size === 0) return;

	for (const listener of importEventListeners.values()) {
		try {
			listener(payload);
		} catch (err) {
			// Keep noisy logs in preload so renderer stays clean.
			console.error('[preload] import event listener failed', err);
		}
	}
});

type PingResult = { message: string; core: string };
type OkTrue = { ok: true };

/**
 * `ElectronApi` implementation exposed to the renderer as `window.electron`.
 *
 * IMPORTANT:
 * - Must stay aligned with the contract defined in `core/src/ipc/api.ts`.
 * - Only expose safe, curated methods.
 */
const api: ElectronApi = {
	ping: () => invoke<PingResult>(CHANNELS.PING),

	import: {
		start: (input?: ImportStartInput) =>
			invoke<ImportStartResult>(CHANNELS.IMPORT_START, input ?? {}),

		onEvent: (listener: ImportEventListener): ImportEventSubscriptionId => {
			importEventSubSeq += 1;

			// Subscription IDs are generated in preload and are renderer-facing only.
			// They are not shared with Electron main.
			const id: ImportEventSubscriptionId = `import_sub_${importEventSubSeq}`;

			importEventListeners.set(id, listener);
			return id;
		},

		offEvent: (subscriptionId: ImportEventSubscriptionId): void => {
			importEventListeners.delete(subscriptionId);
		},
	},

	logs: {
		list: (input?: LogsListInput) => invoke<LogsListResult>(CHANNELS.LOGS_LIST, input ?? {}),
		getEntry: (id: string) => invoke<LogEntryDetails | null>(CHANNELS.LOGS_GET_ENTRY, id),
		facets: () => invoke<LogsFacetsResult>(CHANNELS.LOGS_FACETS),
	},

	explorer: {
		getGame: (gameId: string) =>
			invoke<ExplorerGetGameResult>(CHANNELS.EXPLORER_GET_GAME, gameId),
	},

	games: {
		list: (input?: GamesListInput) => invoke<GamesListResult>(CHANNELS.GAMES_LIST, input ?? {}),
	},

	system: {
		// Main process should validate the URL before opening it.
		openExternal: (url: string) => invoke<OkTrue>(CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
	},

	accounts: {
		list: () => invoke<AccountsListResult>(CHANNELS.ACCOUNTS_LIST),
		setEnabled: (accountId: string, isEnabled: boolean) =>
			invoke<AccountsSetEnabledResult>(CHANNELS.ACCOUNTS_SET_ENABLED, {
				accountId,
				isEnabled,
			}),
		delete: (accountId: string) =>
			invoke<AccountsDeleteResult>(CHANNELS.ACCOUNTS_DELETE, { accountId }),
		create: (site, username) =>
			invoke<AccountsCreateResult>(CHANNELS.ACCOUNTS_CREATE, { site, username }),
	},
};

/**
 * Expose a single, curated API surface to the renderer process.
 * The renderer will access it through `window.electron`.
 */
contextBridge.exposeInMainWorld('electron', api);
