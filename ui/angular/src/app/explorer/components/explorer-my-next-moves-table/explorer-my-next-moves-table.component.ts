import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
	signal,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import type { MyNextMoveRow, MyNextMovesPositionSummary } from 'my-chess-opening-core';

import { DateFormatService } from '../../../shared/dates/date-format.service';

interface InfoPopoverData {
	title: string;
	lastPlayedLabel: string;
	whiteWinsCount: number;
	drawsCount: number;
	blackWinsCount: number;
}

/**
 * Presentational table for Explorer "My next moves".
 *
 * Responsibilities:
 * - render the ordered candidate move rows
 * - show popularity and White / Draw / Black breakdowns
 * - expose per-row info popovers
 * - keep the current-position summary row always visible at the bottom
 * - emit UI intents when a candidate move row is selected or hovered
 */
@Component({
	selector: 'app-explorer-my-next-moves-table',
	standalone: true,
	imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule],
	templateUrl: './explorer-my-next-moves-table.component.html',
	styleUrl: './explorer-my-next-moves-table.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerMyNextMovesTableComponent {
	private readonly dateFormat = inject(DateFormatService);

	@Input({ required: true }) rows: MyNextMoveRow[] = [];

	@Input({ required: true }) positionSummary: MyNextMovesPositionSummary | null = null;

	/**
	 * Emitted when the user selects a candidate move row.
	 */
	@Output() readonly moveSelected = new EventEmitter<MyNextMoveRow>();

	/**
	 * Emitted when the user hovers or focuses a candidate row.
	 *
	 * Payload:
	 * - row => hover/focus start
	 * - null => hover/focus end
	 */
	@Output() readonly moveHovered = new EventEmitter<MyNextMoveRow | null>();

	readonly infoPopoverData = signal<InfoPopoverData | null>(null);

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

	onMoveRowClick(row: MyNextMoveRow): void {
		this.moveSelected.emit(row);
	}

	onMoveRowEnter(row: MyNextMoveRow): void {
		this.moveHovered.emit(row);
	}

	onMoveRowLeave(): void {
		this.moveHovered.emit(null);
	}

	openMoveInfo(row: MyNextMoveRow): void {
		this.infoPopoverData.set({
			title: row.moveSan,
			lastPlayedLabel: this.formatLastPlayedLabel(row.lastPlayedAtIso),
			whiteWinsCount: row.outcomes.whiteWinsCount,
			drawsCount: row.outcomes.drawsCount,
			blackWinsCount: row.outcomes.blackWinsCount,
		});
	}

	openSummaryInfo(summary: MyNextMovesPositionSummary): void {
		this.infoPopoverData.set({
			title: 'Current position',
			lastPlayedLabel: this.formatLastPlayedLabel(summary.lastPlayedAtIso),
			whiteWinsCount: summary.outcomes.whiteWinsCount,
			drawsCount: summary.outcomes.drawsCount,
			blackWinsCount: summary.outcomes.blackWinsCount,
		});
	}

	private formatLastPlayedLabel(value: string | null | undefined): string {
		if (!value) {
			return '—';
		}

		return this.dateFormat.formatDateTime(value);
	}
}
