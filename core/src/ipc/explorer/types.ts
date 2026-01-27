import type { ExplorerGameSnapshotV1 } from '../../explorer/types';

/**
 * Explorer IPC contracts.
 *
 * `explorer.getGame(gameId)` is used by the UI to load a persisted game from the DB
 * (Electron/Prisma) and hydrate the Explorer session from a snapshot.
 *
 * Important design points:
 * - The snapshot contract is versioned (`ExplorerGameSnapshotV1`) and should evolve additively.
 * - Errors are explicit and structured to keep UI logic simple and predictable.
 */

export type ExplorerGetGameError =
	| {
			/** The provided id is missing/empty/invalid. */
			code: 'INVALID_ID';
			message: string;
	  }
	| {
			/** No game exists for this id (or not accessible). */
			code: 'NOT_FOUND';
			message: string;
	  }
	| {
			/** Unexpected database or query failure. */
			code: 'DB_ERROR';
			message: string;
	  };

export type ExplorerGetGameResult =
	| { ok: true; snapshot: ExplorerGameSnapshotV1 }
	| { ok: false; error: ExplorerGetGameError };

/**
 * Explorer domain API exposed over IPC.
 */
export interface ExplorerApi {
	getGame: (gameId: string) => Promise<ExplorerGetGameResult>;
}
