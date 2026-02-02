import type { ExternalSite } from '../../import/types';

/**
 * Accounts IPC contracts.
 *
 * This API manages chess account configurations persisted in the database.
 *
 * Important:
 * - `lastSyncAt` must remain a raw ISO string (as stored in DB).
 *   Do not format dates in Electron/core; the UI will handle formatting later.
 */

/**
 * One row displayed in the "Chess accounts" list.
 */
export type ChessAccountRow = {
	/** AccountConfig id (DB primary key). */
	id: string;

	/** External site provider (e.g. LICHESS, CHESSCOM). */
	site: ExternalSite;

	/** Username on the external site. */
	username: string;

	/** Whether this account is enabled for sync/import. */
	isEnabled: boolean;

	/** Last successful sync timestamp (raw ISO), or null when never synced. */
	lastSyncAt: string | null;

	/** Total number of games stored for this account. */
	gamesTotal: number;
};

/**
 * Standard error shape for accounts IPC operations.
 *
 * Notes:
 * - Use `INVALID_ID` when the accountId is empty/invalid.
 * - Use `VALIDATION_ERROR` for payload validation issues (username empty, unsupported site, etc.).
 * - Use `NOT_FOUND` when the referenced account does not exist.
 * - Use `ALREADY_EXISTS` when creating a duplicate (same site + username).
 * - Use `DB_ERROR` for Prisma/DB failures.
 */
export type AccountsError =
	| { code: 'NOT_IMPLEMENTED'; message: string }
	| { code: 'INVALID_ID'; message: string }
	| { code: 'VALIDATION_ERROR'; message: string }
	| { code: 'NOT_FOUND'; message: string }
	| { code: 'ALREADY_EXISTS'; message: string }
	| { code: 'DB_ERROR'; message: string };

/**
 * Helper for building consistent IPC results across endpoints.
 */
export type AccountsResult<T> = ({ ok: true } & T) | { ok: false; error: AccountsError };

export type AccountsListResult = AccountsResult<{ rows: ChessAccountRow[] }>;

export type AccountsSetEnabledResult = AccountsResult<{}>;
export type AccountsDeleteResult = AccountsResult<{}>;

export type AccountsCreateResult = AccountsResult<{ accountId: string }>;

/**
 * Accounts domain API exposed over IPC.
 *
 * This interface is part of the `ElectronApi` contract (preload must conform to it).
 */
export interface AccountsApi {
	/** List configured accounts with basic stats used by the UI. */
	list: () => Promise<AccountsListResult>;

	/** Enable/disable an account (destructive operations are not performed here). */
	setEnabled: (accountId: string, isEnabled: boolean) => Promise<AccountsSetEnabledResult>;

	/** Delete an account and all associated DB data (destructive). */
	delete: (accountId: string) => Promise<AccountsDeleteResult>;

	/** Create a new account configuration. */
	create: (site: ExternalSite, username: string) => Promise<AccountsCreateResult>;
}
