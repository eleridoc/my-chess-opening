import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import type {
	DashboardAccountBlock,
	DashboardDailyResultRatioPoint,
	DashboardEloPoint,
	DashboardGameSpeed,
	DashboardSpeedBlock,
} from 'my-chess-opening-core';

import { DashboardEloChartComponent } from '../dashboard-elo-chart/dashboard-elo-chart.component';
import {
	DashboardHeatmapComponent,
	type DashboardHeatmapPoint,
} from '../dashboard-heatmap/dashboard-heatmap.component';
import { DashboardSummaryCardComponent } from '../dashboard-summary-card/dashboard-summary-card.component';

interface DashboardAccountSpeedViewModel {
	block: DashboardSpeedBlock;
	label: string;
	subtitle: string;
	eloHistory: DashboardEloPoint[];
	dailyActivityPoints: DashboardHeatmapPoint[];
	dailyResultRatioPoints: DashboardHeatmapPoint[];
}

/**
 * Dashboard account block.
 *
 * Displays:
 * - one account-level summary
 * - one section per speed with data
 * - Elo history chart for each speed
 * - activity and result-ratio heatmaps for each speed
 */
@Component({
	selector: 'app-dashboard-account-block',
	standalone: true,
	imports: [
		CommonModule,
		DashboardSummaryCardComponent,
		DashboardHeatmapComponent,
		DashboardEloChartComponent,
	],
	templateUrl: './dashboard-account-block.component.html',
	styleUrl: './dashboard-account-block.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardAccountBlockComponent implements OnChanges {
	@Input({ required: true }) account!: DashboardAccountBlock;

	/**
	 * First visible month for nested heatmaps.
	 *
	 * The value is expected as YYYY-MM-DD.
	 */
	@Input() startDate: string | null = null;

	@Input() rangeMonths = 12;

	speedBlocks: DashboardAccountSpeedViewModel[] = [];

	ngOnChanges(_changes: SimpleChanges): void {
		this.speedBlocks = this.buildSpeedViewModels();
	}

	trackSpeedByValue(_index: number, item: DashboardAccountSpeedViewModel): DashboardGameSpeed {
		return item.block.speed;
	}

	accountSubtitle(): string {
		const totalGames = this.account.summary.totalGames;
		const gamesLabel = totalGames === 1 ? 'game' : 'games';

		return `${this.siteLabel(this.account.site)} · ${totalGames} ${gamesLabel}`;
	}

	private buildSpeedViewModels(): DashboardAccountSpeedViewModel[] {
		return this.account.speeds.map((speedBlock) => ({
			block: speedBlock,
			label: this.speedLabel(speedBlock.speed),
			subtitle: this.speedSubtitle(speedBlock),
			eloHistory: speedBlock.eloHistory,
			dailyActivityPoints: this.buildDailyActivityPoints(speedBlock),
			dailyResultRatioPoints: this.buildDailyResultRatioPoints(speedBlock),
		}));
	}

	private buildDailyActivityPoints(speedBlock: DashboardSpeedBlock): DashboardHeatmapPoint[] {
		return speedBlock.dailyActivity.map((point) => ({
			date: point.date,
			value: point.gamesCount,
		}));
	}

	private buildDailyResultRatioPoints(speedBlock: DashboardSpeedBlock): DashboardHeatmapPoint[] {
		return speedBlock.dailyResultRatio.map((point) => ({
			date: point.date,
			value: point.val,
			tooltipText: this.buildResultRatioTooltipText(point),
		}));
	}

	private speedLabel(speed: DashboardGameSpeed): string {
		switch (speed) {
			case 'bullet':
				return 'Bullet';

			case 'blitz':
				return 'Blitz';

			case 'rapid':
				return 'Rapid';

			default:
				return String(speed);
		}
	}

	private speedSubtitle(speedBlock: DashboardSpeedBlock): string {
		const totalGames = speedBlock.summary.totalGames;
		const gamesLabel = totalGames === 1 ? 'game' : 'games';

		return `${totalGames} ${gamesLabel} in this speed`;
	}

	private siteLabel(site: DashboardAccountBlock['site']): string {
		switch (site) {
			case 'LICHESS':
				return 'Lichess';

			case 'CHESSCOM':
				return 'Chess.com';

			default:
				return String(site);
		}
	}

	private buildResultRatioTooltipText(point: DashboardDailyResultRatioPoint): string {
		if (point.val === 0) {
			return `No games on ${point.date}`;
		}

		const trend =
			point.val === 1 ? 'Positive day' : point.val === 4 ? 'Negative day' : 'Neutral day';

		return `${trend} · ratio ${point.ratio} · ${point.wins}W / ${point.draws}D / ${point.losses}L on ${point.date}`;
	}
}
