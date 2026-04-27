import { CommonModule } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	Input,
	NgZone,
	OnChanges,
	OnDestroy,
	SimpleChanges,
	ViewChild,
	inject,
} from '@angular/core';

import CalHeatmap from 'cal-heatmap';
import Tooltip from 'cal-heatmap/plugins/Tooltip';

let dashboardHeatmapId = 0;

export type DashboardHeatmapMode = 'activity' | 'ratio';

export type DashboardHeatmapSize = 'default' | 'large';

export interface DashboardHeatmapPoint {
	/**
	 * Calendar date in YYYY-MM-DD format.
	 */
	date: string;

	/**
	 * Numeric value displayed on the heatmap.
	 */
	value: number;

	/**
	 * Optional tooltip text.
	 *
	 * When provided, it is used instead of the generic activity / ratio tooltip.
	 */
	tooltipText?: string;
}

interface DashboardHeatmapTooltipDate {
	format: (format: string) => string;
}

interface DashboardHeatmapDimensions {
	domainGutter: number;
	subDomainWidth: number;
	subDomainHeight: number;
	subDomainGutter: number;
	subDomainRadius: number;
}

/**
 * Angular wrapper around cal-heatmap for Dashboard charts.
 *
 * Responsibilities:
 * - isolate cal-heatmap lifecycle from Dashboard page components
 * - repaint safely when inputs change
 * - destroy the previous instance before repainting
 * - keep data mapping consistent for daily Dashboard points
 */
@Component({
	selector: 'app-dashboard-heatmap',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './dashboard-heatmap.component.html',
	styleUrl: './dashboard-heatmap.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeatmapComponent implements AfterViewInit, OnChanges, OnDestroy {
	private readonly ngZone = inject(NgZone);

	@ViewChild('container', { static: true })
	private containerRef!: ElementRef<HTMLDivElement>;

	@Input() title = '';

	@Input() subtitle = '';

	@Input() points: DashboardHeatmapPoint[] = [];

	/**
	 * Activity mode is used for positive count-like values.
	 * Ratio mode is used for categorical daily result-ratio values.
	 */
	@Input() mode: DashboardHeatmapMode = 'activity';

	/**
	 * Visual size of the heatmap.
	 *
	 * - default: compact charts used inside account / speed sections
	 * - large: main Dashboard heatmaps with larger cells and spacing
	 */
	@Input() size: DashboardHeatmapSize = 'default';

	/**
	 * First visible month.
	 *
	 * The date is expected as YYYY-MM-DD.
	 * cal-heatmap rounds it to the beginning of the month domain.
	 */
	@Input() startDate: string | null = null;

	/**
	 * Number of visible month domains.
	 */
	@Input() rangeMonths = 12;

	readonly elementId = `dashboard-heatmap-${++dashboardHeatmapId}`;

	private calendar: CalHeatmap | null = null;
	private viewReady = false;
	private latestRenderId = 0;
	private tooltipTextByDate = new Map<string, string>();

	ngAfterViewInit(): void {
		this.viewReady = true;
		void this.render();
	}

	ngOnChanges(_changes: SimpleChanges): void {
		if (!this.viewReady) {
			return;
		}

		void this.render();
	}

	ngOnDestroy(): void {
		this.latestRenderId += 1;

		void this.destroyCalendar();
	}

	private async render(): Promise<void> {
		if (!this.viewReady) {
			return;
		}

		const renderId = ++this.latestRenderId;

		await this.destroyCalendar();

		if (renderId !== this.latestRenderId) {
			return;
		}

		this.tooltipTextByDate = new Map(
			this.points
				.filter((point) => Boolean(point.tooltipText))
				.map((point) => [point.date, point.tooltipText as string]),
		);

		const source = this.points
			.map((point) => {
				const timestamp = parseCalendarDateToTimestamp(point.date);

				if (timestamp === null) {
					return null;
				}

				return {
					date: timestamp,
					value: point.value,
				};
			})
			.filter((point): point is { date: number; value: number } => point !== null);

		const maxActivityValue = Math.max(1, ...source.map((point) => Math.abs(point.value)));
		const start = parseCalendarDateToDate(this.startDate) ?? getDefaultStartDate();
		const dimensions = this.getDimensions();

		const calendar = new CalHeatmap();
		this.calendar = calendar;

		await this.ngZone.runOutsideAngular(async () => {
			const paintData = {
				theme: this.getCalHeatmapTheme(),
				itemSelector: `#${this.elementId}`,
				range: Math.max(1, this.rangeMonths),
				date: {
					start,
					locale: {
						weekStart: 1,
					},
				},
				domain: {
					type: 'month',
					gutter: dimensions.domainGutter,
					label: {
						text: 'MMM',
						textAlign: 'start',
						position: 'top',
					},
				},
				subDomain: {
					type: 'ghDay',
					width: dimensions.subDomainWidth,
					height: dimensions.subDomainHeight,
					gutter: dimensions.subDomainGutter,
					radius: dimensions.subDomainRadius,
					/**
					 * Keep the scale-generated color for cells with real values.
					 * Only override zero-game activity cells.
					 */
					color: (_timestamp: number, value: number | null, backgroundColor: string) =>
						this.resolveCellColor(value, backgroundColor),
				},
				data: {
					source,
					x: 'date',
					y: 'value',
					groupY: 'sum',
					defaultValue: 0,
				},
				scale: this.buildScale(maxActivityValue),
				animationDuration: 120,
			};

			await calendar.paint(paintData, [
				[
					Tooltip,
					{
						text: (
							_timestamp: number,
							value: number | null,
							dayjsDate: DashboardHeatmapTooltipDate,
						) => this.buildTooltipText(value, dayjsDate),
					},
				],
			]);
		});
	}

	private getDimensions(): DashboardHeatmapDimensions {
		if (this.size === 'large') {
			return {
				domainGutter: 12,
				subDomainWidth: 16,
				subDomainHeight: 16,
				subDomainGutter: 4,
				subDomainRadius: 4,
			};
		}

		return {
			domainGutter: 8,
			subDomainWidth: 11,
			subDomainHeight: 11,
			subDomainGutter: 2,
			subDomainRadius: 2,
		};
	}

	private resolveCellColor(value: number | null, backgroundColor: string): string {
		if (this.mode === 'activity' && (value === 0 || value === null || value === undefined)) {
			return getCssColor('--mco-dashboard-heatmap-activity-zero', '#000000');
		}

		return backgroundColor;
	}

	private async destroyCalendar(): Promise<void> {
		const calendar = this.calendar;
		this.calendar = null;

		if (calendar) {
			try {
				await calendar.destroy();
			} catch (error) {
				console.warn('[DashboardHeatmap] Failed to destroy cal-heatmap instance:', error);
			}
		}

		this.containerRef?.nativeElement.replaceChildren();
	}

	private buildTooltipText(value: number | null, dayjsDate: DashboardHeatmapTooltipDate): string {
		const dateLabel = dayjsDate.format('YYYY-MM-DD');
		const customTooltipText = this.tooltipTextByDate.get(dateLabel);

		if (customTooltipText) {
			return customTooltipText;
		}

		if (value === null || value === undefined) {
			return `No data on ${dateLabel}`;
		}

		if (this.mode === 'ratio') {
			return `${this.formatRatioTooltip(value)} on ${dateLabel}`;
		}

		return `${this.formatActivityTooltip(value)} on ${dateLabel}`;
	}

	private formatActivityTooltip(value: number): string {
		const roundedValue = Math.round(value);

		if (roundedValue <= 0) {
			return 'No games';
		}

		if (roundedValue === 1) {
			return '1 game';
		}

		return `${roundedValue} games`;
	}

	private formatRatioTooltip(value: number): string {
		const normalizedValue = Number(value.toFixed(4));

		if (normalizedValue > 0) {
			return `Positive day · ratio ${normalizedValue}`;
		}

		if (normalizedValue < 0) {
			return `Negative day · ratio ${normalizedValue}`;
		}

		return 'Neutral day · ratio 0';
	}

	private buildScale(maxActivityValue: number): object {
		if (this.mode === 'ratio') {
			return {
				color: {
					/**
					 * Result-ratio heatmaps use explicit categorical values:
					 * - 0 = no games
					 * - 1 = positive day
					 * - 2 = neutral day
					 * - 4 = negative day
					 */
					type: 'threshold',
					domain: [1, 2, 4],
					range: [
						getCssColor('--mco-dashboard-heatmap-ratio-empty', 'var(--app-bg-plus-5)'),
						getCssColor('--mco-dashboard-heatmap-ratio-positive', '#7bd88f'),
						getCssColor('--mco-dashboard-heatmap-ratio-neutral', '#7a7a7a'),
						getCssColor('--mco-dashboard-heatmap-ratio-negative', '#ff6b6b'),
					],
				},
			};
		}

		return {
			color: {
				/**
				 * Activity heatmap buckets:
				 * - 0 games
				 * - 1 to 5 games
				 * - 6 to 10 games
				 * - 11 to 20 games
				 * - 21+ games
				 */
				type: 'threshold',
				domain: [1, 6, 11, 21],
				range: [
					getCssColor('--mco-dashboard-heatmap-activity-0', 'var(--app-bg-plus-5)'),
					getCssColor('--mco-dashboard-heatmap-activity-1', '#dbeafe'),
					getCssColor('--mco-dashboard-heatmap-activity-2', '#93c5fd'),
					getCssColor('--mco-dashboard-heatmap-activity-3', '#3b82f6'),
					getCssColor('--mco-dashboard-heatmap-activity-4', '#1d4ed8'),
				],
			},
		};
	}

	private getCalHeatmapTheme(): 'light' | 'dark' {
		return document.body.classList.contains('theme-light') ? 'light' : 'dark';
	}
}

/**
 * Parse YYYY-MM-DD into a local timestamp.
 *
 * Returning a timestamp avoids relying on Date.parse() for date-only strings,
 * which can otherwise introduce timezone-related day shifts.
 */
function parseCalendarDateToTimestamp(value: string): number | null {
	const date = parseCalendarDateToDate(value);

	return date === null ? null : date.getTime();
}

/**
 * Parse YYYY-MM-DD into a local Date at noon.
 *
 * Noon is used to avoid DST edge cases around local midnight.
 */
function parseCalendarDateToDate(value: string | null): Date | null {
	if (!value) {
		return null;
	}

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
		return null;
	}

	return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Default to the first day of the month, eleven months ago.
 *
 * This gives a 12-month window when rangeMonths is 12.
 */
function getDefaultStartDate(): Date {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
	start.setMonth(start.getMonth() - 11);

	return start;
}

/**
 * Resolve CSS custom properties to concrete color values for cal-heatmap.
 *
 * D3 color scales work best with concrete CSS color values instead of var(...).
 */
function getCssColor(name: string, fallback: string): string {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

	return value || fallback;
}
