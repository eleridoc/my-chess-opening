import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { MyNextMoveRow, MyNextMovesPositionSummary } from 'my-chess-opening-core';

import { IsoDateTimePipe } from '../../../shared/dates/pipes';

/**
 * Presentational table for Explorer "My next moves".
 *
 * Responsibilities:
 * - render the ordered candidate move rows
 * - show popularity and White / Draw / Black breakdowns
 * - expose per-row tooltip details
 * - keep the current-position summary row always visible at the bottom
 * - emit UI intents when a candidate move row is selected
 */
@Component({
	selector: 'app-explorer-my-next-moves-table',
	standalone: true,
	imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, IsoDateTimePipe],
	templateUrl: './explorer-my-next-moves-table.component.html',
	styleUrl: './explorer-my-next-moves-table.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerMyNextMovesTableComponent {
	@Input({ required: true }) rows: MyNextMoveRow[] = [];

	@Input({ required: true }) positionSummary: MyNextMovesPositionSummary | null = null;

	/**
	 * Emitted when the user selects a candidate move row.
	 *
	 * Notes:
	 * - Only candidate rows are clickable.
	 * - The persistent "Current" summary row is informational only.
	 */
	@Output() readonly moveSelected = new EventEmitter<MyNextMoveRow>();

	trackByMove(_index: number, row: MyNextMoveRow): string {
		return `${row.moveUci}::${row.moveSan}`;
	}

	formatPercent(value: number): string {
		return `${Math.round(this.clampPercent(value))}%`;
	}

	clampPercent(value: number): number {
		if (!Number.isFinite(value)) {
			return 0;
		}

		return Math.max(0, Math.min(100, value));
	}

	/**
	 * Only show an inline label inside an outcome segment when the segment
	 * is wide enough to keep the row readable and dense.
	 */
	shouldShowOutcomeLabel(value: number): boolean {
		return this.clampPercent(value) >= 14;
	}

	buildInfoTooltip(row: MyNextMoveRow, lastPlayedLabel: string): string {
		return `Last played: ${lastPlayedLabel} • Counts White / Draw / Black: ${row.outcomes.whiteWinsCount} / ${row.outcomes.drawsCount} / ${row.outcomes.blackWinsCount}`;
	}

	buildSummaryTooltip(summary: MyNextMovesPositionSummary, lastPlayedLabel: string): string {
		return `Current position • Last played: ${lastPlayedLabel} • Counts White / Draw / Black: ${summary.outcomes.whiteWinsCount} / ${summary.outcomes.drawsCount} / ${summary.outcomes.blackWinsCount}`;
	}

	onMoveRowClick(row: MyNextMoveRow): void {
		this.moveSelected.emit(row);
	}
}
