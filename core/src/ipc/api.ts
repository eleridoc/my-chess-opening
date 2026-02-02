/**
 * IPC API surface exposed to the UI (via preload).
 *
 * This file is the *public contract* between:
 * - Electron main/preload (IPC handlers + contextBridge)
 * - Angular UI (typed `window.electron` API)
 *
 * Guidelines:
 * - Keep this surface small and stable.
 * - Prefer additive changes (new fields / new methods) over breaking changes.
 * - Re-export domain types for convenience in UI/electron layers.
 */

// -----------------------------------------------------------------------------
// Public type exports (domain contracts)
// -----------------------------------------------------------------------------
//
// These re-exports allow both Electron (main/preload) and the Angular UI
// to import shared IPC contracts from a single entry-point.
//

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
} from './games/types';

export type {
	ChessAccountRow,
	AccountsError,
	AccountsListResult,
	AccountsSetEnabledResult,
	AccountsDeleteResult,
	AccountsCreateResult,
	AccountsApi,
} from './accounts/types';

// -----------------------------------------------------------------------------
// Compose ElectronApi from domain APIs
// -----------------------------------------------------------------------------

import type { SetupApi } from './setup/types';
import type { ImportApi } from './import/types';
import type { LogsApi } from '../logs/types';
import type { ExplorerApi } from './explorer/types';
import type { GamesApi } from './games/types';
import type { AccountsApi } from './accounts/types';

/**
 * Small system-level IPC helpers that are not tied to a single domain.
 * Example: opening a URL in the user's default browser.
 */
export interface SystemApi {
	/** Open a URL using the OS default handler (browser, mail client, etc.). */
	openExternal: (url: string) => Promise<{ ok: true }>;
}

/**
 * Top-level API exposed to the renderer process.
 *
 * The preload script must conform to this interface exactly:
 * - It defines the shape of `window.electron`.
 * - Breaking changes here ripple through the entire app.
 */
export interface ElectronApi {
	/**
	 * Simple health-check used to validate IPC wiring.
	 * "core" is the version string of the shared core package.
	 */
	ping: () => Promise<{ message: string; core: string }>;

	/** App setup / bootstrap APIs. */
	setup: SetupApi;

	/** Import orchestration APIs (run now, etc.). */
	import: ImportApi;

	/** Import logs APIs (list, details, facets). */
	logs: LogsApi;

	/** Explorer APIs (load game snapshots, navigation, etc.). */
	explorer: ExplorerApi;

	/** Games APIs (list, filters, etc.). */
	games: GamesApi;

	/** Miscellaneous system-level helpers. */
	system: SystemApi;

	/** Chess accounts management APIs (list, enable/disable, create, delete). */
	accounts: AccountsApi;
}
