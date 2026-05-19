import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { MatTooltipModule } from '@angular/material/tooltip';

import type { AnalysisEvaluation, GameMoveAnalysisRow } from 'my-chess-opening-core';

import {
	formatCentipawns,
	formatEvaluation,
	formatMoveLabel,
} from '../explorer-analysis-formatters';

/**
 * Displays persisted move-by-move Stockfish analysis rows.
 */
@Component({
	selector: 'app-explorer-move-analysis-table',
	standalone: true,
	imports: [CommonModule, MatTooltipModule],
	templateUrl: './explorer-move-analysis-table.component.html',
	styleUrl: './explorer-move-analysis-table.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerMoveAnalysisTableComponent {
	@Input() moves: GameMoveAnalysisRow[] = [];

	get sortedMoves(): GameMoveAnalysisRow[] {
		return this.moves.slice().sort((a, b) => a.ply - b.ply);
	}

	formatMoveLabel(move: GameMoveAnalysisRow): string {
		return formatMoveLabel(move);
	}

	formatEvaluation(evaluation: AnalysisEvaluation | null): string {
		return formatEvaluation(evaluation);
	}

	evaluationClass(evaluation: AnalysisEvaluation | null): string {
		if (!evaluation) {
			return 'explorer-move-analysis-table__eval--empty';
		}

		const score = evaluation.cp ?? evaluation.mate;

		if (score === null || score === 0) {
			return 'explorer-move-analysis-table__eval--neutral';
		}

		return score > 0
			? 'explorer-move-analysis-table__eval--white'
			: 'explorer-move-analysis-table__eval--black';
	}

	formatEvaluationSwing(move: GameMoveAnalysisRow): string {
		const before = move.evalBefore?.cp;
		const after = move.evalAfter?.cp;

		if (before === null || before === undefined || after === null || after === undefined) {
			return '—';
		}

		return formatCentipawns(after - before);
	}

	evaluationSwingClass(move: GameMoveAnalysisRow): string {
		const before = move.evalBefore?.cp;
		const after = move.evalAfter?.cp;

		if (before === null || before === undefined || after === null || after === undefined) {
			return 'explorer-move-analysis-table__eval--empty';
		}

		const swing = after - before;

		if (swing === 0) {
			return 'explorer-move-analysis-table__eval--neutral';
		}

		return swing > 0
			? 'explorer-move-analysis-table__eval--white'
			: 'explorer-move-analysis-table__eval--black';
	}

	formatBestMove(move: GameMoveAnalysisRow): string {
		return move.bestMoveUci ?? '—';
	}

	formatDepth(move: GameMoveAnalysisRow): string {
		return move.depthReached === null ? '—' : String(move.depthReached);
	}

	formatTime(move: GameMoveAnalysisRow): string {
		return move.timeMs === null ? '—' : `${move.timeMs} ms`;
	}

	formatPrincipalVariation(move: GameMoveAnalysisRow): string {
		if (move.principalVariationUci.length === 0) {
			return '—';
		}

		const maxDisplayedMoves = 8;
		const displayedMoves = move.principalVariationUci.slice(0, maxDisplayedMoves);
		const suffix = move.principalVariationUci.length > maxDisplayedMoves ? ' …' : '';

		return `${displayedMoves.join(' ')}${suffix}`;
	}
}
