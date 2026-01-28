import type {
	ExplorerApplyMoveResult,
	ExplorerMoveAttempt,
	PromotionRequiredDetails,
} from './types';
import type { ExplorerSessionState } from './session.state';
import { tryCreateChessFromCurrentFen } from './session.internals';
import {
	buildUci,
	getPromotionOptions,
	isSquare,
	makeError,
	normalizePromotionPiece,
} from './session.utils';
import { upsertChildFromAppliedMove } from './session.tree';

export function applyMoveUci(
	state: ExplorerSessionState,
	attempt: ExplorerMoveAttempt,
): ExplorerApplyMoveResult {
	const from = (attempt.from ?? '').toLowerCase();
	const to = (attempt.to ?? '').toLowerCase();

	if (!isSquare(from) || !isSquare(to)) {
		return {
			ok: false,
			error: makeError('ILLEGAL_MOVE', 'Invalid square coordinates.', { from, to }),
		};
	}

	const chess = tryCreateChessFromCurrentFen(state);
	if (!chess) {
		return {
			ok: false,
			error: makeError(
				'INTERNAL_ERROR',
				'Failed to initialize chess engine from current FEN.',
			),
		};
	}

	// Promotion detection BEFORE applying the move:
	// - null => (from->to) is not a legal move at all
	// - [] => legal and NOT a promotion
	// - ['q','r','b','n'] (or subset) => legal AND promotion is available
	const promotionOptions = getPromotionOptions(chess, from, to);
	if (promotionOptions === null) {
		return {
			ok: false,
			error: makeError('ILLEGAL_MOVE', 'Illegal move.', {
				from,
				to,
				promotion: attempt.promotion,
			}),
		};
	}

	const requiresPromotion = promotionOptions.length > 0;
	const promotion = attempt.promotion;

	if (requiresPromotion && !promotion) {
		const details: PromotionRequiredDetails = { from, to, options: promotionOptions };
		return {
			ok: false,
			error: makeError('PROMOTION_REQUIRED', 'Promotion piece is required.', details),
		};
	}

	if (requiresPromotion && promotion && !promotionOptions.includes(promotion)) {
		return {
			ok: false,
			error: makeError('ILLEGAL_MOVE', 'Invalid promotion piece.', {
				from,
				to,
				promotion,
				allowed: promotionOptions,
			}),
		};
	}

	// IMPORTANT:
	// Only pass `promotion` to chess.js if the move is actually a promotion.
	// Some chess.js builds may reject unexpected `promotion` fields.
	const moveResult = requiresPromotion
		? chess.move({ from, to, promotion })
		: chess.move({ from, to });

	if (!moveResult) {
		return {
			ok: false,
			error: makeError('ILLEGAL_MOVE', 'Illegal move.', {
				from,
				to,
				promotion: requiresPromotion ? promotion : undefined,
			}),
		};
	}

	const san = moveResult.san;

	// Canonical promotion applied (if any) comes from chess.js result.
	const promotionApplied = normalizePromotionPiece((moveResult as any).promotion);
	const uci = buildUci(from, to, promotionApplied);
	const fenAfter = chess.fen();

	return upsertChildFromAppliedMove(state, {
		from,
		to,
		fenAfter,
		uci,
		san,
		promotionApplied,
	});
}
