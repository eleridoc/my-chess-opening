import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { MyNextMoveRow } from 'my-chess-opening-core';

import { IsoDateTimePipe } from '../../../shared/dates/pipes';

/**
 * Presentational table for Explorer "My next moves".
 *
 * Responsibilities:
 * - render the ordered candidate move rows
 * - show popularity and White / Draw / Black breakdowns
 * - expose per-row tooltip details
 *
 * Notes:
 * - The sticky summary row is handled later as a dedicated feature.
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

	buildInfoTooltip(row: MyNextMoveRow, lastPlayedLabel: string): string {
		return `Last played: ${lastPlayedLabel} • Counts White / Draw / Black: ${row.outcomes.whiteWinsCount} / ${row.outcomes.drawsCount} / ${row.outcomes.blackWinsCount}`;
	}
}
