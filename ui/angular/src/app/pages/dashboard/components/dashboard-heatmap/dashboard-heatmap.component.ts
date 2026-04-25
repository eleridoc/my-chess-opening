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

let dashboardHeatmapId = 0;

export type DashboardHeatmapMode = 'activity' | 'ratio';

export interface DashboardHeatmapPoint {
	/**
	 * Calendar date in YYYY-MM-DD format.
	 */
	date: string;

	/**
	 * Numeric value displayed on the heatmap.
	 */
	value: number;
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
	 * Ratio mode is used for values in the -1..1 range.
	 */
	@Input() mode: DashboardHeatmapMode = 'activity';

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

		const calendar = new CalHeatmap();
		this.calendar = calendar;

		await this.ngZone.runOutsideAngular(async () => {
			await calendar.paint({
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
					gutter: 8,
					label: {
						text: 'MMM',
						textAlign: 'start',
						position: 'top',
					},
				},
				subDomain: {
					type: 'ghDay',
					width: 11,
					height: 11,
					gutter: 2,
					radius: 2,
				},
				data: {
					source,
					x: 'date',
					y: 'value',
					groupY: 'sum',
					defaultValue: null,
				},
				scale: this.buildScale(maxActivityValue),
				animationDuration: 120,
			});
		});
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

	private buildScale(maxActivityValue: number): object {
		if (this.mode === 'ratio') {
			return {
				color: {
					type: 'linear',
					domain: [-1, 1],
					range: [
						getCssColor('--app-danger', '#ff6b6b'),
						getCssColor('--app-bg-plus-2', '#2a2f3a'),
						getCssColor('--app-success', '#7bd88f'),
					],
					interpolate: 'hsl',
				},
			};
		}

		return {
			opacity: {
				baseColor: getCssColor('--app-primary', '#abc7ff'),
				type: 'linear',
				domain: [0, maxActivityValue],
			},
		};
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
