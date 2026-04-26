import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import type { DashboardEloPoint } from 'my-chess-opening-core';

import { IsoDatePipe } from '../../../../shared/dates/pipes';

const SVG_WIDTH = 720;
const SVG_HEIGHT = 240;

const CHART_LEFT = 52;
const CHART_RIGHT = 18;
const CHART_TOP = 18;
const CHART_BOTTOM = 38;

const CHART_WIDTH = SVG_WIDTH - CHART_LEFT - CHART_RIGHT;
const CHART_HEIGHT = SVG_HEIGHT - CHART_TOP - CHART_BOTTOM;
const CHART_BOTTOM_Y = SVG_HEIGHT - CHART_BOTTOM;

interface DashboardEloChartPointViewModel extends DashboardEloPoint {
	x: number;
	y: number;
}

interface DashboardEloChartTick {
	y: number;
	value: number;
	label: string;
}

interface DashboardEloChartViewModel {
	hasData: boolean;
	points: DashboardEloChartPointViewModel[];
	markerPoints: DashboardEloChartPointViewModel[];
	yTicks: DashboardEloChartTick[];
	pathD: string;
	areaD: string;
	minElo: number | null;
	maxElo: number | null;
	startElo: number | null;
	endElo: number | null;
	deltaElo: number | null;
	firstPoint: DashboardEloChartPointViewModel | null;
	lastPoint: DashboardEloChartPointViewModel | null;
}

const EMPTY_CHART: DashboardEloChartViewModel = {
	hasData: false,
	points: [],
	markerPoints: [],
	yTicks: [],
	pathD: '',
	areaD: '',
	minElo: null,
	maxElo: null,
	startElo: null,
	endElo: null,
	deltaElo: null,
	firstPoint: null,
	lastPoint: null,
};

/**
 * Dashboard Elo chart.
 *
 * This component intentionally uses a local SVG implementation instead of a chart dependency.
 * The Dashboard only needs a compact line chart for account + speed Elo history.
 */
@Component({
	selector: 'app-dashboard-elo-chart',
	standalone: true,
	imports: [CommonModule, IsoDatePipe],
	templateUrl: './dashboard-elo-chart.component.html',
	styleUrl: './dashboard-elo-chart.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardEloChartComponent implements OnChanges {
	@Input() title = 'Elo evolution';

	@Input() subtitle = '';

	@Input() points: DashboardEloPoint[] = [];

	readonly viewBox = `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`;

	chart: DashboardEloChartViewModel = EMPTY_CHART;

	ngOnChanges(_changes: SimpleChanges): void {
		this.chart = this.buildChart();
	}

	formatDelta(value: number | null): string {
		if (value === null) {
			return '—';
		}

		if (value > 0) {
			return `+${value}`;
		}

		return `${value}`;
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
		const points = this.normalizePoints();

		if (points.length === 0) {
			return EMPTY_CHART;
		}

		const eloValues = points.map((point) => point.elo);
		const minElo = Math.min(...eloValues);
		const maxElo = Math.max(...eloValues);

		const eloRange = maxElo - minElo;
		const padding = eloRange > 0 ? Math.max(10, Math.ceil(eloRange * 0.12)) : 20;

		const lowerBound = minElo - padding;
		const upperBound = maxElo + padding;
		const boundedRange = Math.max(1, upperBound - lowerBound);

		const scaleX = (index: number): number => {
			if (points.length === 1) {
				return CHART_LEFT + CHART_WIDTH / 2;
			}

			return CHART_LEFT + (index / (points.length - 1)) * CHART_WIDTH;
		};

		const scaleY = (elo: number): number =>
			CHART_TOP + ((upperBound - elo) / boundedRange) * CHART_HEIGHT;

		const chartPoints = points.map((point, index) => ({
			...point,
			x: round(scaleX(index)),
			y: round(scaleY(point.elo)),
		}));

		const pathD = chartPoints
			.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
			.join(' ');

		const firstPoint = chartPoints[0] ?? null;
		const lastPoint = chartPoints[chartPoints.length - 1] ?? null;

		const areaD =
			firstPoint && lastPoint
				? `${pathD} L ${lastPoint.x} ${CHART_BOTTOM_Y} L ${firstPoint.x} ${CHART_BOTTOM_Y} Z`
				: '';

		const markerPoints = this.buildMarkerPoints(chartPoints);
		const yTicks = this.buildYTicks(lowerBound, upperBound, scaleY);

		const startElo = firstPoint?.elo ?? null;
		const endElo = lastPoint?.elo ?? null;

		return {
			hasData: true,
			points: chartPoints,
			markerPoints,
			yTicks,
			pathD,
			areaD,
			minElo,
			maxElo,
			startElo,
			endElo,
			deltaElo: startElo !== null && endElo !== null ? endElo - startElo : null,
			firstPoint,
			lastPoint,
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

	private buildMarkerPoints(
		points: DashboardEloChartPointViewModel[],
	): DashboardEloChartPointViewModel[] {
		if (points.length <= 120) {
			return points;
		}

		const step = Math.ceil(points.length / 80);
		const lastIndex = points.length - 1;

		return points.filter(
			(_point, index) => index === 0 || index === lastIndex || index % step === 0,
		);
	}

	private buildYTicks(
		lowerBound: number,
		upperBound: number,
		scaleY: (elo: number) => number,
	): DashboardEloChartTick[] {
		const middle = Math.round((lowerBound + upperBound) / 2);
		const values = [Math.round(upperBound), middle, Math.round(lowerBound)];

		return [...new Set(values)].map((value) => ({
			value,
			label: `${value}`,
			y: round(scaleY(value)),
		}));
	}
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
