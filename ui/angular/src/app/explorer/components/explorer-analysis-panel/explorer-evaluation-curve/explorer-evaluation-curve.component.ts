import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { LineChart } from 'echarts/charts';
import {
	DataZoomComponent,
	GridComponent,
	MarkLineComponent,
	TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { AnalysisEvaluation, GameMoveAnalysisRow } from 'my-chess-opening-core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

import { formatEvaluation, formatMoveLabel } from '../explorer-analysis-formatters';

echarts.use([
	LineChart,
	GridComponent,
	TooltipComponent,
	MarkLineComponent,
	DataZoomComponent,
	CanvasRenderer,
]);

interface EvaluationChartPoint {
	label: string;
	moveLabel: string;
	evaluationLabel: string;
	score: number;
}

interface EvaluationChartViewModel {
	hasData: boolean;
	options: EChartsCoreOption;
	ariaLabel: string;
}

const EMPTY_EVALUATION_CHART: EvaluationChartViewModel = {
	hasData: false,
	options: {},
	ariaLabel: 'No Stockfish evaluation chart available',
};

const EVALUATION_CHART_MAX_ABS_SCORE = 10;
const EVALUATION_CHART_MATE_SCORE = 10;

/**
 * Displays the Stockfish evaluation curve from White's point of view.
 */
@Component({
	selector: 'app-explorer-evaluation-curve',
	standalone: true,
	imports: [CommonModule, NgxEchartsDirective],
	providers: [provideEchartsCore({ echarts })],
	templateUrl: './explorer-evaluation-curve.component.html',
	styleUrl: './explorer-evaluation-curve.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerEvaluationCurveComponent {
	@Input() moves: GameMoveAnalysisRow[] = [];

	get evaluationChart(): EvaluationChartViewModel {
		const points = this.buildEvaluationChartPoints(this.moves);

		if (points.length === 0) {
			return EMPTY_EVALUATION_CHART;
		}

		return {
			hasData: true,
			options: this.buildEvaluationChartOptions(points),
			ariaLabel:
				'Stockfish evaluation curve with black area above the curve and white area below it',
		};
	}

	private buildEvaluationChartPoints(moves: GameMoveAnalysisRow[]): EvaluationChartPoint[] {
		if (moves.length === 0) {
			return [];
		}

		const sortedMoves = moves.slice().sort((a, b) => a.ply - b.ply);
		const points: EvaluationChartPoint[] = [];
		const firstMove = sortedMoves[0];
		const initialScore = this.evaluationToChartScore(firstMove.evalBefore, null);

		if (initialScore !== null) {
			points.push({
				label: 'Start',
				moveLabel: 'Start',
				evaluationLabel: formatEvaluation(firstMove.evalBefore),
				score: initialScore,
			});
		}

		for (const move of sortedMoves) {
			const score = this.evaluationToChartScore(move.evalAfter, move.playedBy);

			if (score === null) {
				continue;
			}

			const moveLabel = formatMoveLabel(move);

			points.push({
				label: moveLabel,
				moveLabel,
				evaluationLabel: formatEvaluation(move.evalAfter),
				score,
			});
		}

		return points;
	}

	private evaluationToChartScore(
		evaluation: AnalysisEvaluation | null,
		mateZeroPlayedBy: 'white' | 'black' | null,
	): number | null {
		if (!evaluation) {
			return null;
		}

		if (evaluation.cp !== null) {
			return this.clampEvaluationChartScore(evaluation.cp / 100);
		}

		if (evaluation.mate !== null) {
			return this.mateToChartScore(evaluation.mate, mateZeroPlayedBy);
		}

		return null;
	}

	private mateToChartScore(mate: number, mateZeroPlayedBy: 'white' | 'black' | null): number {
		if (mate > 0) {
			return EVALUATION_CHART_MATE_SCORE;
		}

		if (mate < 0) {
			return -EVALUATION_CHART_MATE_SCORE;
		}

		// Stockfish can return mate 0 when the side to move is already mated.
		// For an after-move evaluation, the player who just moved delivered mate.
		if (mateZeroPlayedBy === 'white') {
			return EVALUATION_CHART_MATE_SCORE;
		}

		if (mateZeroPlayedBy === 'black') {
			return -EVALUATION_CHART_MATE_SCORE;
		}

		return 0;
	}

	private clampEvaluationChartScore(score: number): number {
		return Math.max(
			-EVALUATION_CHART_MAX_ABS_SCORE,
			Math.min(EVALUATION_CHART_MAX_ABS_SCORE, score),
		);
	}

	private buildEvaluationChartOptions(points: EvaluationChartPoint[]): EChartsCoreOption {
		const primaryColor = this.cssVar('--app-primary', '#abc7ff');
		const whiteAreaColor = '#f4f4f4';
		const blackAreaColor = '#111111';
		const whiteAdvantageColor = this.cssVar('--app-success', '#4caf50');
		const blackAdvantageColor = this.cssVar('--app-danger', '#f44336');
		const textColor = this.cssVar('--app-text', '#f5f7fb');
		const mutedTextColor = this.cssVar('--app-text-muted', '#9ca3af');
		const dividerColor = this.cssVar('--app-divider', '#2f3542');
		const surfaceColor = this.cssVar('--app-bg-plus-1', '#171b24');

		const bounds = this.buildEvaluationChartBounds();
		const labels = points.map((point) => point.label);

		return {
			backgroundColor: 'transparent',
			animation: true,
			animationDuration: 300,
			grid: {
				show: true,
				backgroundColor: blackAreaColor,
				left: 34,
				right: 14,
				top: 18,
				bottom: 30,
				containLabel: true,
			},
			tooltip: {
				trigger: 'axis',
				confine: true,
				backgroundColor: surfaceColor,
				borderColor: dividerColor,
				borderWidth: 1,
				padding: 8,
				textStyle: {
					color: textColor,
					fontFamily:
						'Ubuntu, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
					fontSize: 11,
				},
				axisPointer: {
					type: 'line',
					lineStyle: {
						color: primaryColor,
						width: 1,
						type: 'dashed',
					},
				},
				formatter: (params: unknown) => this.formatEvaluationChartTooltip(params),
			},
			dataZoom: [
				{
					type: 'inside',
					xAxisIndex: 0,
					filterMode: 'none',
				},
			],
			xAxis: {
				type: 'category',
				data: labels,
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
				},
				splitLine: {
					show: false,
				},
			},
			yAxis: {
				type: 'value',
				min: bounds.min,
				max: bounds.max,
				scale: false,
				splitNumber: 4,
				axisLine: {
					show: false,
				},
				axisTick: {
					show: false,
				},
				axisLabel: {
					color: mutedTextColor,
					formatter: (value: number) => this.formatChartAxisValue(value),
				},
				splitLine: {
					lineStyle: {
						color: dividerColor,
						width: 1,
					},
				},
			},
			series: [
				{
					name: 'Evaluation',
					type: 'line',
					smooth: false,
					showSymbol: points.length <= 80,
					symbolSize: 5,
					clip: true,
					z: 10,
					lineStyle: {
						width: 2,
						color: primaryColor,
					},
					areaStyle: {
						color: whiteAreaColor,
						opacity: 1,
						origin: 'start',
					},
					itemStyle: {
						color: (params: unknown) => {
							const score = this.readChartSeriesScore(params);

							if (score === null || score === 0) {
								return mutedTextColor;
							}

							return score > 0 ? whiteAdvantageColor : blackAdvantageColor;
						},
					},
					emphasis: {
						focus: 'series',
					},
					markLine: {
						silent: true,
						symbol: 'none',
						label: {
							show: true,
							position: 'end',
							formatter: '0',
							color: mutedTextColor,
						},
						lineStyle: {
							color: dividerColor,
							width: 1,
							type: 'dashed',
						},
						data: [
							{
								yAxis: 0,
							},
						],
					},
					data: points.map((point) => ({
						value: point.score,
						moveLabel: point.moveLabel,
						evaluationLabel: point.evaluationLabel,
						score: point.score,
					})),
				},
			],
		};
	}

	private buildEvaluationChartBounds(): { min: number; max: number } {
		return {
			min: -EVALUATION_CHART_MAX_ABS_SCORE,
			max: EVALUATION_CHART_MAX_ABS_SCORE,
		};
	}

	private formatEvaluationChartTooltip(params: unknown): string {
		const firstParam = Array.isArray(params) ? params[0] : params;

		if (!this.isRecord(firstParam)) {
			return '';
		}

		const data = firstParam['data'];

		if (!this.isRecord(data)) {
			return '';
		}

		const moveLabel = this.readString(data['moveLabel'], 'Position');
		const evaluationLabel = this.readString(data['evaluationLabel'], '—');
		const rawScore = this.readChartPointScore(data);
		const sideLabel =
			rawScore === null || rawScore === 0
				? 'Equal position'
				: rawScore > 0
					? 'White advantage'
					: 'Black advantage';

		return [
			`<strong>${this.escapeHtml(moveLabel)}</strong>`,
			`Evaluation: ${this.escapeHtml(evaluationLabel)}`,
			this.escapeHtml(sideLabel),
		].join('<br />');
	}

	private formatChartAxisValue(value: number): string {
		if (value > 0) {
			return `+${value.toFixed(1)}`;
		}

		return value.toFixed(1);
	}

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	private readChartPointScore(data: Record<string, unknown>): number | null {
		if (typeof data['score'] === 'number') {
			return data['score'];
		}

		const value = data['value'];

		return typeof value === 'number' ? value : null;
	}

	private readChartSeriesScore(params: unknown): number | null {
		if (!this.isRecord(params)) {
			return null;
		}

		const data = params['data'];

		if (!this.isRecord(data)) {
			return null;
		}

		return this.readChartPointScore(data);
	}

	private readString(value: unknown, fallback: string): string {
		return typeof value === 'string' && value.length > 0 ? value : fallback;
	}

	private escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	private cssVar(name: string, fallback: string): string {
		if (typeof document === 'undefined') {
			return fallback;
		}

		const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

		return value || fallback;
	}
}
