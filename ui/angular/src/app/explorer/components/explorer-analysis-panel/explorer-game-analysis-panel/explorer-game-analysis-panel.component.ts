import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import type {
	GameAnalysisDetails,
	GameAnalysisStatus,
	GameMoveAnalysisRow,
} from 'my-chess-opening-core';

import { IsoDateTimePipe } from '../../../../shared/dates/pipes';
import { ExplorerEvaluationCurveComponent } from '../explorer-evaluation-curve/explorer-evaluation-curve.component';
import { formatMoveLabel } from '../explorer-analysis-formatters';
import { ExplorerMoveAnalysisTableComponent } from '../explorer-move-analysis-table/explorer-move-analysis-table.component';

interface AnalysisQuickStats {
	analyzedMoves: number;
	averageDepth: number | null;
	averageTimeMs: number | null;
	bestMoveMatches: number;
	bestMoveMatchPercent: number | null;
	averageCentipawnLoss: number | null;
	largestCentipawnLoss: number | null;
	largestCentipawnLossMoveLabel: string | null;
}

/**
 * Displays the analysis summary, actions and derived quick stats.
 */
@Component({
	selector: 'app-explorer-game-analysis-panel',
	standalone: true,
	imports: [
		CommonModule,
		MatButtonModule,
		MatIconModule,
		MatProgressBarModule,
		MatTooltipModule,
		IsoDateTimePipe,
		ExplorerEvaluationCurveComponent,
		ExplorerMoveAnalysisTableComponent,
	],
	templateUrl: './explorer-game-analysis-panel.component.html',
	styleUrl: './explorer-game-analysis-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerGameAnalysisPanelComponent {
	@Input() analysis: GameAnalysisDetails | null = null;
	@Input() loadError: string | null = null;
	@Input() canStartAnalysis = false;
	@Input() isAnalyzing = false;
	@Input() isCancelling = false;

	@Output() startAnalysis = new EventEmitter<boolean>();
	@Output() cancelAnalysis = new EventEmitter<void>();

	get analysisMoves(): GameMoveAnalysisRow[] {
		return (this.analysis?.moves ?? []).slice().sort((a, b) => a.ply - b.ply);
	}

	get analysisProgressPercent(): number {
		if (!this.analysis || this.analysis.summary.totalPlies <= 0) {
			return 0;
		}

		return Math.round(
			(this.analysis.summary.analyzedPlies / this.analysis.summary.totalPlies) * 100,
		);
	}

	get quickStats(): AnalysisQuickStats | null {
		const moves = this.analysisMoves;

		if (moves.length === 0) {
			return null;
		}

		let depthSum = 0;
		let depthCount = 0;

		let timeSum = 0;
		let timeCount = 0;

		let comparableBestMoves = 0;
		let bestMoveMatches = 0;

		let centipawnLossSum = 0;
		let centipawnLossCount = 0;

		let largestCentipawnLoss: number | null = null;
		let largestCentipawnLossMoveLabel: string | null = null;

		for (const move of moves) {
			if (move.depthReached !== null) {
				depthSum += move.depthReached;
				depthCount += 1;
			}

			if (move.timeMs !== null) {
				timeSum += move.timeMs;
				timeCount += 1;
			}

			if (move.moveUci && move.bestMoveUci) {
				comparableBestMoves += 1;

				if (move.moveUci.toLowerCase() === move.bestMoveUci.toLowerCase()) {
					bestMoveMatches += 1;
				}
			}

			const centipawnLoss = this.getCentipawnLossForPlayedMove(move);

			if (centipawnLoss !== null) {
				centipawnLossSum += centipawnLoss;
				centipawnLossCount += 1;

				if (largestCentipawnLoss === null || centipawnLoss > largestCentipawnLoss) {
					largestCentipawnLoss = centipawnLoss;
					largestCentipawnLossMoveLabel = formatMoveLabel(move);
				}
			}
		}

		return {
			analyzedMoves: moves.length,
			averageDepth: depthCount > 0 ? depthSum / depthCount : null,
			averageTimeMs: timeCount > 0 ? timeSum / timeCount : null,
			bestMoveMatches,
			bestMoveMatchPercent:
				comparableBestMoves > 0 ? (bestMoveMatches / comparableBestMoves) * 100 : null,
			averageCentipawnLoss: centipawnLossCount > 0 ? centipawnLossSum / centipawnLossCount : null,
			largestCentipawnLoss,
			largestCentipawnLossMoveLabel,
		};
	}

	emitStartAnalysis(force: boolean): void {
		this.startAnalysis.emit(force);
	}

	emitCancelAnalysis(): void {
		this.cancelAnalysis.emit();
	}

	statusLabel(status: GameAnalysisStatus): string {
		switch (status) {
			case 'PENDING':
				return 'Pending';
			case 'RUNNING':
				return 'Running';
			case 'COMPLETED':
				return 'Completed';
			case 'FAILED':
				return 'Failed';
			case 'CANCELLED':
				return 'Cancelled';
			default:
				return status;
		}
	}

	statusClass(status: GameAnalysisStatus): string {
		return `explorer-game-analysis-panel__status--${status.toLowerCase()}`;
	}

	formatAverageDepth(value: number | null): string {
		if (value === null) {
			return '—';
		}

		return value.toFixed(1);
	}

	formatAverageTime(value: number | null): string {
		if (value === null) {
			return '—';
		}

		return `${Math.round(value)} ms`;
	}

	formatBestMoveMatches(stats: AnalysisQuickStats): string {
		if (stats.bestMoveMatchPercent === null) {
			return `${stats.bestMoveMatches}`;
		}

		return `${stats.bestMoveMatches} (${stats.bestMoveMatchPercent.toFixed(0)}%)`;
	}

	formatCentipawnLoss(value: number | null): string {
		if (value === null) {
			return '—';
		}

		return `${Math.round(value)} cp`;
	}

	/**
	 * Compute the centipawn loss for the player who made the move.
	 *
	 * Evaluations are stored from White's point of view:
	 * - White loses value when the evaluation decreases.
	 * - Black loses value when the evaluation increases.
	 */
	private getCentipawnLossForPlayedMove(move: GameMoveAnalysisRow): number | null {
		const before = move.evalBefore?.cp;
		const after = move.evalAfter?.cp;

		if (before === null || before === undefined || after === null || after === undefined) {
			return null;
		}

		const rawLoss = move.playedBy === 'white' ? before - after : after - before;

		return Math.max(0, rawLoss);
	}
}
