import type { ExplorerGameHeaders } from './types';
import type { ExplorerSessionState } from './session.state';
import type { PgnTags } from './utils/pgn-tags';

import { buildExplorerCurrentLinePgn } from './position-export';
import { getNode } from './session.internals';
import * as sel from './session.selectors';

export type ExplorerCurrentLinePgnInput = {
	/** Optional normalized headers override. */
	headers?: ExplorerGameHeaders | null;

	/** Optional raw PGN tags override. */
	pgnTags?: PgnTags | null;
};

/**
 * Export helpers for ExplorerSession.
 *
 * This module groups read-only export-oriented helpers so that session.ts can stay focused
 * on the public class surface while the actual export logic remains split by concern.
 */
export function getCurrentLinePgn(
	state: ExplorerSessionState,
	input?: ExplorerCurrentLinePgnInput,
): string {
	const rootFen = getNode(state, state.tree.rootId).fen;

	return buildExplorerCurrentLinePgn({
		source: state.source,
		rootFen,
		currentPathMoves: sel.getCurrentPathMoves(state),
		headers: input?.headers ?? state.dbSnapshot?.headers ?? null,
		pgnTags: input?.pgnTags ?? state.dbSnapshot?.pgnTags ?? null,
	});
}
