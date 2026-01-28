import { Chess } from 'chess.js';

import type {
	ExplorerDbGameMeta,
	ExplorerGameSnapshot,
	ExplorerPgnMeta,
	ExplorerResult,
} from './types';
import { makeError, normalizePgnText, tryLoadPgn, cloneDbGameSnapshot } from './session.utils';
import type { ExplorerSessionState } from './session.state';
import { resetTreeToRootFen, rebuildTreeFromSanMoves } from './session.tree';

export function resetToInitial(state: ExplorerSessionState): void {
	state.mode = 'CASE1_FREE';
	state.source = { kind: 'FREE' };
	state.dbSnapshot = null;

	const initialFen = new Chess().fen();
	resetTreeToRootFen(state, initialFen);
}

export function loadFenForCase1(state: ExplorerSessionState, fen: string): ExplorerResult {
	if (state.mode !== 'CASE1_FREE') {
		return {
			ok: false,
			error: makeError(
				'RESET_REQUIRED',
				'Loading a FEN position is only allowed in CASE1. Please reset the session first.',
			),
		};
	}

	let chess: Chess;
	try {
		chess = new Chess(fen);
	} catch {
		return { ok: false, error: makeError('INVALID_FEN', 'Invalid FEN.', { fen }) };
	}

	const normalizedFen = chess.fen();
	resetTreeToRootFen(state, normalizedFen);

	state.mode = 'CASE1_FREE';
	state.source = { kind: 'FEN', fen: normalizedFen };

	return { ok: true };
}

export function loadPgn(
	state: ExplorerSessionState,
	pgn: string,
	meta?: ExplorerPgnMeta,
): ExplorerResult {
	if (state.mode !== 'CASE1_FREE') {
		return {
			ok: false,
			error: makeError(
				'RESET_REQUIRED',
				'Loading a PGN is only allowed from CASE1. Please reset the session first.',
			),
		};
	}

	const trimmed = (pgn ?? '').trim();
	if (trimmed.length === 0) {
		return { ok: false, error: makeError('INVALID_PGN', 'PGN is empty.') };
	}

	const normalized = normalizePgnText(trimmed);

	const chessForParsing = new Chess();
	const loadAttempt = tryLoadPgn(chessForParsing, normalized);

	if (!loadAttempt.ok) {
		return {
			ok: false,
			error: makeError('INVALID_PGN', 'Failed to parse PGN.', {
				reason: loadAttempt.reason,
				preview: normalized.slice(0, 200),
			}),
		};
	}

	const movesSan = chessForParsing.history();
	if (!Array.isArray(movesSan) || movesSan.length === 0) {
		return { ok: false, error: makeError('INVALID_PGN', 'PGN contains no moves.') };
	}

	const rebuild = rebuildTreeFromSanMoves(state, movesSan, () => resetToInitial(state));
	if (!rebuild.ok) return rebuild;

	state.mode = 'CASE2_PGN';
	state.source = { kind: 'PGN', name: meta?.name };

	return { ok: true };
}

export function loadGameMovesSan(
	state: ExplorerSessionState,
	movesSan: string[],
	meta: ExplorerDbGameMeta,
): ExplorerResult {
	if (state.mode !== 'CASE1_FREE') {
		return {
			ok: false,
			error: makeError(
				'RESET_REQUIRED',
				'Loading a DB game is only allowed from CASE1. Please reset the session first.',
			),
		};
	}

	if (!meta?.gameId || meta.gameId.trim().length === 0) {
		return {
			ok: false,
			error: makeError('INTERNAL_ERROR', 'Missing gameId for DB load.'),
		};
	}

	if (!Array.isArray(movesSan) || movesSan.length === 0) {
		return {
			ok: false,
			error: makeError('INVALID_PGN', 'DB game contains no moves.'),
		};
	}

	const rebuild = rebuildTreeFromSanMoves(state, movesSan, () => resetToInitial(state));
	if (!rebuild.ok) return rebuild;

	state.mode = 'CASE2_DB';
	state.source = { kind: 'DB', gameId: meta.gameId };

	return { ok: true };
}

export function loadDbGameSnapshot(
	state: ExplorerSessionState,
	snapshot: ExplorerGameSnapshot,
): ExplorerResult {
	if (state.mode !== 'CASE1_FREE') {
		return {
			ok: false,
			error: makeError(
				'RESET_REQUIRED',
				'Loading a DB game snapshot is only allowed from CASE1. Please reset the session first.',
			),
		};
	}

	if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.kind !== 'DB') {
		return {
			ok: false,
			error: makeError('INTERNAL_ERROR', 'Invalid DB game snapshot.', {
				schemaVersion: (snapshot as any)?.schemaVersion,
				kind: (snapshot as any)?.kind,
			}),
		};
	}

	const gameId = (snapshot.gameId ?? '').trim();
	if (gameId.length === 0) {
		return {
			ok: false,
			error: makeError('INTERNAL_ERROR', 'Missing gameId for DB snapshot load.'),
		};
	}

	if (!snapshot.headers || typeof snapshot.headers !== 'object') {
		return {
			ok: false,
			error: makeError('INTERNAL_ERROR', 'Missing headers for DB snapshot load.'),
		};
	}

	if (!Array.isArray(snapshot.movesSan) || snapshot.movesSan.length === 0) {
		return {
			ok: false,
			error: makeError('INVALID_PGN', 'DB game snapshot contains no moves.'),
		};
	}

	const rebuild = rebuildTreeFromSanMoves(state, snapshot.movesSan, () => resetToInitial(state));
	if (!rebuild.ok) return rebuild;

	state.mode = 'CASE2_DB';
	state.source = { kind: 'DB', gameId };

	state.dbSnapshot = cloneDbGameSnapshot({ ...snapshot, gameId });

	return { ok: true };
}
