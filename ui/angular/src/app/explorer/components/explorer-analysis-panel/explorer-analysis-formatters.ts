import type { AnalysisEvaluation, GameMoveAnalysisRow } from 'my-chess-opening-core';

export function formatMoveLabel(move: GameMoveAnalysisRow): string {
	const separator = move.playedBy === 'white' ? '.' : '...';

	return `${move.moveNumber}${separator} ${move.moveSan}`;
}

export function formatEvaluation(evaluation: AnalysisEvaluation | null): string {
	if (!evaluation) {
		return '—';
	}

	if (evaluation.mate !== null) {
		return `M${formatSignedInteger(evaluation.mate)}`;
	}

	if (evaluation.cp !== null) {
		return formatCentipawns(evaluation.cp);
	}

	return '—';
}

export function formatCentipawns(cp: number): string {
	const pawns = cp / 100;
	const prefix = pawns > 0 ? '+' : '';

	return `${prefix}${pawns.toFixed(2)}`;
}

export function formatSignedInteger(value: number): string {
	return value > 0 ? `+${value}` : String(value);
}
