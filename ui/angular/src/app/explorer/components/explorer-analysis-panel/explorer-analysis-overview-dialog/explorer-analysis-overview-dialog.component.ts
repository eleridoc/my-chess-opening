import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import type {
	AnalysisEngineStatus,
	AnalysisSettings,
	GameAnalysisDetails,
	GameMoveAnalysisRow,
} from 'my-chess-opening-core';

import { IsoDateTimePipe } from '../../../../shared/dates/pipes';
import { formatMoveLabel } from '../explorer-analysis-formatters';
import { ExplorerAnalysisOverviewComponent } from '../explorer-analysis-overview/explorer-analysis-overview.component';

export type ExplorerAnalysisOverviewDialogData = {
	currentDbGameId: string | null;
	engineStatus: AnalysisEngineStatus | null;
	settings: AnalysisSettings | null;
	latestAnalysis: GameAnalysisDetails | null;
};

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
 * Displays informational Stockfish analysis metadata in a dialog.
 */
@Component({
	selector: 'app-explorer-analysis-overview-dialog',
	standalone: true,
	imports: [
		CommonModule,
		MatButtonModule,
		MatDialogModule,
		MatIconModule,
		MatProgressBarModule,
		IsoDateTimePipe,
		ExplorerAnalysisOverviewComponent,
	],
	templateUrl: './explorer-analysis-overview-dialog.component.html',
	styleUrl: './explorer-analysis-overview-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerAnalysisOverviewDialogComponent {
	readonly data = inject<ExplorerAnalysisOverviewDialogData>(MAT_DIALOG_DATA);

	private readonly dialogRef = inject(MatDialogRef<ExplorerAnalysisOverviewDialogComponent>);

	get analysisMoves(): GameMoveAnalysisRow[] {
		return (this.data.latestAnalysis?.moves ?? []).slice().sort((a, b) => a.ply - b.ply);
	}

	get analysisProgressPercent(): number {
		const analysis = this.data.latestAnalysis;

		if (!analysis || analysis.summary.totalPlies <= 0) {
			return 0;
		}

		return Math.round((analysis.summary.analyzedPlies / analysis.summary.totalPlies) * 100);
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

	close(): void {
		this.dialogRef.close();
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
