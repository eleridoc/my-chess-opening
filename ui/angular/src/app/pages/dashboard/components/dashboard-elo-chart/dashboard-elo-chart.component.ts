import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	Input,
	OnChanges,
	SimpleChanges,
	inject,
} from '@angular/core';

import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { DashboardEloPoint } from 'my-chess-opening-core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

import { DateFormatService } from '../../../../shared/dates/date-format.service';
import { IsoDatePipe } from '../../../../shared/dates/pipes';

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

interface DashboardEloChartViewModel {
	hasData: boolean;
	options: EChartsCoreOption;
	startElo: number | null;
	endElo: number | null;
	deltaElo: number | null;
	minElo: number | null;
	maxElo: number | null;
	firstPlayedAtIso: string | null;
	lastPlayedAtIso: string | null;
	gamesCount: number;
}

interface DashboardEloChartDataPoint {
	value: [string, number];
	playedAtIso: string;
	elo: number;
}

const EMPTY_CHART: DashboardEloChartViewModel = {
	hasData: false,
	options: {},
	startElo: null,
	endElo: null,
	deltaElo: null,
	minElo: null,
	maxElo: null,
	firstPlayedAtIso: null,
	lastPlayedAtIso: null,
	gamesCount: 0,
};

/**
 * Dashboard Elo chart.
 *
 * Uses Apache ECharts through ngx-echarts instead of a custom SVG implementation.
 * This provides a cleaner responsive chart, native hover tooltips and future zoom support.
 */
@Component({
	selector: 'app-dashboard-elo-chart',
	standalone: true,
	imports: [CommonModule, NgxEchartsDirective, IsoDatePipe],
	providers: [provideEchartsCore({ echarts })],
	templateUrl: './dashboard-elo-chart.component.html',
	styleUrl: './dashboard-elo-chart.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardEloChartComponent implements OnChanges {
	private readonly dateFormat = inject(DateFormatService);

	@Input() title = 'Elo evolution';

	@Input() subtitle = '';

	@Input() points: DashboardEloPoint[] = [];

	chart: DashboardEloChartViewModel = EMPTY_CHART;

	ngOnChanges(_changes: SimpleChanges): void {
		this.chart = this.buildChart();
	}

	formatDelta(value: number | null): string {
		if (value === null) {
			return '—';
		}

		return value > 0 ? `+${value}` : `${value}`;
	}

	deltaClass(value: number | null): string {
		if (value === null || value === 0) {
			return 'dashboard-elo-chart__metric-value--neutral';
		}

		return value > 0
			? 'dashboard-elo-chart__metric-value--positive'
			: 'dashboard-elo-chart__metric-value--negative';
	}

	ariaLabel(): string {
		if (!this.chart.hasData) {
			return `${this.title}: no Elo data available`;
		}

		return `${this.title}: Elo from ${this.chart.startElo} to ${this.chart.endElo}`;
	}

	private buildChart(): DashboardEloChartViewModel {
		const normalizedPoints = this.normalizePoints();

		if (normalizedPoints.length === 0) {
			return EMPTY_CHART;
		}

		const data = normalizedPoints.map<DashboardEloChartDataPoint>((point) => ({
			value: [point.playedAtIso, point.elo],
			playedAtIso: point.playedAtIso,
			elo: point.elo,
		}));

		const eloValues = normalizedPoints.map((point) => point.elo);
		const minElo = Math.min(...eloValues);
		const maxElo = Math.max(...eloValues);
		const bounds = this.buildYAxisBounds(minElo, maxElo);

		const firstPoint = normalizedPoints[0];
		const lastPoint = normalizedPoints[normalizedPoints.length - 1];

		return {
			hasData: true,
			options: this.buildChartOptions(data, bounds.min, bounds.max),
			startElo: firstPoint.elo,
			endElo: lastPoint.elo,
			deltaElo: lastPoint.elo - firstPoint.elo,
			minElo,
			maxElo,
			firstPlayedAtIso: firstPoint.playedAtIso,
			lastPlayedAtIso: lastPoint.playedAtIso,
			gamesCount: normalizedPoints.length,
		};
	}

	private normalizePoints(): DashboardEloPoint[] {
		return this.points
			.map((point, index) => ({
				point,
				index,
				time: Date.parse(point.playedAtIso),
			}))
			.filter(
				(item) =>
					Number.isFinite(item.point.elo) &&
					Number.isFinite(item.time) &&
					item.point.playedAtIso.trim().length > 0,
			)
			.sort((a, b) => a.time - b.time || a.index - b.index)
			.map((item) => item.point);
	}

	private buildYAxisBounds(minElo: number, maxElo: number): { min: number; max: number } {
		const range = maxElo - minElo;
		const padding = range > 0 ? Math.max(10, Math.ceil(range * 0.12)) : 20;

		return {
			min: Math.floor(minElo - padding),
			max: Math.ceil(maxElo + padding),
		};
	}

	private buildChartOptions(
		data: DashboardEloChartDataPoint[],
		yMin: number,
		yMax: number,
	): EChartsCoreOption {
		const primaryColor = this.cssVar('--app-primary', '#abc7ff');
		const textColor = this.cssVar('--app-text', '#f5f7fb');
		const mutedTextColor = this.cssVar('--app-text-muted', '#9ca3af');
		const dividerColor = this.cssVar('--app-divider', '#2f3542');
		const surfaceColor = this.cssVar('--app-bg-plus-1', '#171b24');

		return {
			backgroundColor: 'transparent',
			animation: true,
			animationDuration: 350,
			grid: {
				left: 44,
				right: 18,
				top: 18,
				bottom: 34,
				containLabel: true,
			},
			tooltip: {
				trigger: 'axis',
				confine: true,
				backgroundColor: surfaceColor,
				borderColor: dividerColor,
				borderWidth: 1,
				padding: 10,
				textStyle: {
					color: textColor,
					fontFamily:
						'Ubuntu, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
					fontSize: 12,
				},
				axisPointer: {
					type: 'line',
					lineStyle: {
						color: primaryColor,
						width: 1,
						type: 'dashed',
					},
				},
				formatter: (params: unknown) => this.formatTooltip(params),
			},
			xAxis: {
				type: 'time',
				boundaryGap: false,
				axisLine: {
					lineStyle: {
						color: dividerColor,
					},
				},
				axisTick: {
					show: false,
				},
				axisLabel: {
					color: mutedTextColor,
					hideOverlap: true,
					formatter: (value: string | number) => this.formatAxisDate(value),
				},
				splitLine: {
					show: false,
				},
			},
			yAxis: {
				type: 'value',
				min: yMin,
				max: yMax,
				scale: true,
				splitNumber: 3,
				axisLine: {
					show: false,
				},
				axisTick: {
					show: false,
				},
				axisLabel: {
					color: mutedTextColor,
					formatter: (value: number) => `${Math.round(value)}`,
				},
				splitLine: {
					lineStyle: {
						color: dividerColor,
						width: 1,
					},
				},
			},
			dataZoom: [
				{
					type: 'inside',
					filterMode: 'none',
					throttle: 50,
				},
			],
			series: [
				{
					name: 'Elo',
					type: 'line',
					data,
					showSymbol: data.length <= 120,
					symbol: 'circle',
					symbolSize: 5,
					sampling: 'lttb',
					connectNulls: true,
					lineStyle: {
						color: primaryColor,
						width: 3,
					},
					itemStyle: {
						color: primaryColor,
						borderColor: surfaceColor,
						borderWidth: 2,
					},
					areaStyle: {
						color: primaryColor,
						opacity: 0.12,
					},
					emphasis: {
						focus: 'series',
					},
				},
			],
		};
	}

	private formatTooltip(params: unknown): string {
		const item = Array.isArray(params) ? params[0] : params;
		const point = this.extractTooltipPoint(item);

		if (!point) {
			return '';
		}

		const formattedDate = this.escapeHtml(this.dateFormat.formatDate(point.playedAtIso));
		const elo = this.escapeHtml(`${point.elo}`);

		return `
			<div class="dashboard-elo-chart-tooltip">
				<div><strong>${formattedDate}</strong></div>
				<div>Elo: <strong>${elo}</strong></div>
			</div>
		`;
	}

	private extractTooltipPoint(value: unknown): DashboardEloChartDataPoint | null {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const data = (value as { data?: unknown }).data;

		if (!data || typeof data !== 'object') {
			return null;
		}

		const maybePoint = data as Partial<DashboardEloChartDataPoint>;

		if (
			typeof maybePoint.playedAtIso !== 'string' ||
			typeof maybePoint.elo !== 'number' ||
			!Number.isFinite(maybePoint.elo)
		) {
			return null;
		}

		return {
			value: maybePoint.value ?? [maybePoint.playedAtIso, maybePoint.elo],
			playedAtIso: maybePoint.playedAtIso,
			elo: maybePoint.elo,
		};
	}

	private formatAxisDate(value: string | number): string {
		const date = typeof value === 'number' ? new Date(value).toISOString() : value;

		return this.dateFormat.formatDate(date);
	}

	private cssVar(name: string, fallback: string): string {
		const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

		return value || fallback;
	}

	private escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}
