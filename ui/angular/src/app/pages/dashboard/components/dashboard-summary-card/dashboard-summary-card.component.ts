import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import type { DashboardSummaryStats } from 'my-chess-opening-core';

/**
 * Reusable Dashboard summary card.
 *
 * Used for:
 * - global summary
 * - future account summaries
 * - future speed summaries
 */
@Component({
	selector: 'app-dashboard-summary-card',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './dashboard-summary-card.component.html',
	styleUrl: './dashboard-summary-card.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSummaryCardComponent {
	@Input({ required: true }) title = '';

	@Input() subtitle = '';

	@Input({ required: true }) summary!: DashboardSummaryStats;

	formatPercent(value: number): string {
		return `${this.formatNumber(value)}%`;
	}

	private formatNumber(value: number): string {
		return new Intl.NumberFormat('en-US', {
			maximumFractionDigits: 2,
		}).format(value);
	}
}
