import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { MatTooltipModule } from '@angular/material/tooltip';

import type {
	GameAnalysisDetails,
	GameAnalysisStatus,
	GameMoveAnalysisRow,
} from 'my-chess-opening-core';

import { ExplorerEvaluationCurveComponent } from '../explorer-evaluation-curve/explorer-evaluation-curve.component';
import { ExplorerMoveAnalysisTableComponent } from '../explorer-move-analysis-table/explorer-move-analysis-table.component';

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
		MatTooltipModule,
		ExplorerEvaluationCurveComponent,
		ExplorerMoveAnalysisTableComponent,
	],
	templateUrl: './explorer-game-analysis-panel.component.html',
	styleUrl: './explorer-game-analysis-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerGameAnalysisPanelComponent {
	@Input() analysis: GameAnalysisDetails | null = null;
	@Input() currentPly: number | null = null;
	@Input() loadError: string | null = null;
	@Input() canStartAnalysis = false;
	@Input() isAnalyzing = false;
	@Input() isCancelling = false;

	@Output() startAnalysis = new EventEmitter<boolean>();
	@Output() cancelAnalysis = new EventEmitter<void>();

	get analysisMoves(): GameMoveAnalysisRow[] {
		return (this.analysis?.moves ?? []).slice().sort((a, b) => a.ply - b.ply);
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
}
