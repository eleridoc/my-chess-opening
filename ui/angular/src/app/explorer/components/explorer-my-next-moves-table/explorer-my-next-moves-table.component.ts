import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import type { MyNextMoveRow } from 'my-chess-opening-core';

/**
 * Presentational table for Explorer "My next moves".
 *
 * Responsibilities:
 * - render the ordered candidate move rows
 * - show popularity and White / Draw / Black breakdowns
 *
 * Notes:
 * - Tooltip details are intentionally deferred to the next iteration.
 * - The sticky summary row is handled later as a dedicated feature.
 */
@Component({
	selector: 'app-explorer-my-next-moves-table',
	standalone: true,
	imports: [CommonModule],
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
}
