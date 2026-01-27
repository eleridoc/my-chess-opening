/**
 * IPC API surface exposed to the UI (via preload).
 *
 * This file acts as the "public contract" between:
 * - Electron main/preload (IPC handlers)
 * - Angular UI (typed window.electron API)
 *
 * Keep this surface small and stable:
 * - Prefer additive changes (new fields / new methods) over breaking changes.
 * - Re-export domain types for convenience in UI/electron layers.
 */

// -----------------------------------------------------------------------------
// Re-export domain types for convenience (public API surface)
// -----------------------------------------------------------------------------

export type { SetupState, SaveAccountsInput, SetupApi } from './setup/types';

export type { ImportRunNowInput, ImportRunNowResult, ImportApi } from './import/types';

export type {
	ImportLogLevel,
	LogsListFilters,
	LogsListInput,
	LogListItem,
	ImportRunContext,
	LogsListResult,
	LogEntryDetails,
	LogsFacetsResult,
	LogsApi,
} from '../logs/types';

export type { ExplorerGetGameError, ExplorerGetGameResult, ExplorerApi } from './explorer/types';

export type {
	GamesListFilters,
	GamesListInput,
	GamesListItem,
	GamesListResult,
	GamesApi,
} from '../games/types';

// -----------------------------------------------------------------------------
// Compose ElectronApi from domain APIs
// -----------------------------------------------------------------------------

import type { SetupApi } from './setup/types';
import type { ImportApi } from './import/types';
import type { LogsApi } from '../logs/types';
import type { ExplorerApi } from './explorer/types';
import type { GamesApi } from '../games/types';

/**
 * Small system-level IPC helpers that are not tied to a single domain.
 * Example: opening a URL in the user's default browser.
 */
export interface SystemApi {
	openExternal: (url: string) => Promise<{ ok: true }>;
}

/**
 * Top-level API exposed to the renderer process.
 * The preload script must conform to this interface.
 */
export interface ElectronApi {
	ping: () => Promise<{ message: string; core: string }>;

	setup: SetupApi;
	import: ImportApi;
	logs: LogsApi;
	explorer: ExplorerApi;
	games: GamesApi;

	system: SystemApi;
}
