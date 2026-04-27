import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { DashboardSummaryStats } from 'my-chess-opening-core';

export type DashboardSummaryCardVariant = 'primary' | 'account' | 'speed';

/**
 * Reusable Dashboard summary card.
 *
 * Variants:
 * - primary: main global Dashboard summary
 * - account: selected account summary
 * - speed: compact speed-level summary inside an account block
 */
@Component({
	selector: 'app-dashboard-summary-card',
	standalone: true,
	imports: [CommonModule, MatIconModule, MatTooltipModule],
	templateUrl: './dashboard-summary-card.component.html',
	styleUrl: './dashboard-summary-card.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSummaryCardComponent {
	@Input({ required: true }) title = '';

	@Input() subtitle = '';

	@Input() variant: DashboardSummaryCardVariant = 'account';

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
