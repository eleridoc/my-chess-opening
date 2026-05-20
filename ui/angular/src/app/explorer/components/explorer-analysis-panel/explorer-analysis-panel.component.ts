import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';

import type {
	ExplorerMoveListRow,
	ExplorerMoveToken,
	ExplorerVariationLine,
} from 'my-chess-opening-core/explorer';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import type {
	AnalysisEngineStatus,
	AnalysisSettings,
	GameAnalysisDetails,
} from 'my-chess-opening-core';

import { AnalysisService } from '../../../services/analysis/analysis.service';
import { SectionLoaderComponent } from '../../../shared/loading/section-loader/section-loader.component';
import { NotificationService } from '../../../shared/notifications/notification.service';
import { ExplorerFacade } from '../../facade/explorer.facade';
import { ExplorerGameAnalysisPanelComponent } from './explorer-game-analysis-panel/explorer-game-analysis-panel.component';

import {
	ExplorerAnalysisOverviewDialogComponent,
	type ExplorerAnalysisOverviewDialogData,
} from './explorer-analysis-overview-dialog/explorer-analysis-overview-dialog.component';

/**
 * Explorer Stockfish analysis container.
 *
 * Responsibilities:
 * - load engine metadata
 * - load latest analysis for the current DB game
 * - start / re-run / cancel one game analysis
 *
 * Rendering details are split into dedicated child components.
 */
@Component({
	selector: 'app-explorer-analysis-panel',
	standalone: true,
	imports: [
		CommonModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		SectionLoaderComponent,
		MatDialogModule,
		ExplorerGameAnalysisPanelComponent,
	],
	templateUrl: './explorer-analysis-panel.component.html',
	styleUrl: './explorer-analysis-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerAnalysisPanelComponent {
	private readonly facade = inject(ExplorerFacade);
	private readonly analysisService = inject(AnalysisService);
	private readonly notify = inject(NotificationService);
	private readonly dialog = inject(MatDialog);

	private latestLoadSeq = 0;
	private cancelRequested = false;

	readonly engineStatus = signal<AnalysisEngineStatus | null>(null);
	readonly settings = signal<AnalysisSettings | null>(null);
	readonly latestAnalysis = signal<GameAnalysisDetails | null>(null);

	readonly loadError = signal<string | null>(null);

	readonly isLoadingEngine = signal(false);
	readonly isLoadingLatestAnalysis = signal(false);
	readonly isAnalyzing = signal(false);
	readonly isCancelling = signal(false);

	readonly currentDbGameId = computed(() => {
		const source = this.facade.source();

		return source.kind === 'DB' ? source.gameId : null;
	});

	readonly hasCurrentDbGame = computed(() => this.currentDbGameId() !== null);

	readonly isEngineAvailable = computed(() => this.engineStatus()?.available === true);

	readonly panelLoading = computed(
		() => this.isLoadingEngine() || this.isLoadingLatestAnalysis() || this.isAnalyzing(),
	);

	readonly loaderLabel = computed(() => {
		if (this.isAnalyzing()) {
			return 'Analyzing game with Stockfish…';
		}

		return 'Loading analysis…';
	});

	readonly canStartAnalysis = computed(
		() => this.hasCurrentDbGame() && this.isEngineAvailable() && !this.isAnalyzing(),
	);

	readonly currentAnalysisPly = computed(() =>
		this.resolveCurrentAnalysisPly(
			this.facade.currentNodeId(),
			this.facade.ply(),
			this.facade.moveListRows(),
			this.facade.variationsByNodeId(),
		),
	);

	constructor() {
		queueMicrotask(() => {
			void this.loadEngineMetadata();
		});

		effect(() => {
			const gameId = this.currentDbGameId();

			// Keep signal writes outside the effect execution frame.
			queueMicrotask(() => {
				void this.loadLatestAnalysisForGame(gameId, { silent: true });
			});
		});
	}

	async refresh(): Promise<void> {
		await this.loadEngineMetadata();
		await this.loadLatestAnalysisForGame(this.currentDbGameId(), { silent: false });
	}

	async startAnalysis(force: boolean): Promise<void> {
		const gameId = this.currentDbGameId();

		if (!gameId) {
			this.notify.warn('Stockfish analysis is available for database games only.');
			return;
		}

		if (!this.isEngineAvailable()) {
			const message = this.engineStatus()?.message ?? 'Stockfish engine is not available.';
			this.notify.error(message);
			return;
		}

		if (this.isAnalyzing()) {
			this.notify.info('A Stockfish analysis is already running.');
			return;
		}

		this.cancelRequested = false;
		this.isAnalyzing.set(true);
		this.loadError.set(null);

		try {
			const result = await this.analysisService.analyzeGame({
				gameId,
				force,
			});

			if (!result.ok) {
				const wasCancelled = this.cancelRequested || result.error.code === 'ANALYSIS_CANCELLED';

				if (wasCancelled) {
					this.notify.warn('Stockfish analysis was cancelled.');
				} else {
					this.loadError.set(result.error.message);
					this.notify.error(`Stockfish analysis failed: ${result.error.message}`);
				}

				await this.loadLatestAnalysisForGame(gameId, { silent: true });
				return;
			}

			this.latestAnalysis.set(result.analysis);
			this.notify.success(
				force ? 'Stockfish analysis completed again.' : 'Stockfish analysis completed.',
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.loadError.set(message);
			this.notify.error(`Stockfish analysis failed: ${message}`);
		} finally {
			this.isAnalyzing.set(false);
			this.isCancelling.set(false);
			this.cancelRequested = false;
		}
	}

	async cancelAnalysis(): Promise<void> {
		if (!this.isAnalyzing() || this.isCancelling()) {
			return;
		}

		this.cancelRequested = true;
		this.isCancelling.set(true);

		try {
			const result = await this.analysisService.cancelCurrentAnalysis();

			if (!result.ok) {
				this.notify.error(`Failed to cancel analysis: ${result.error.message}`);
				return;
			}

			if (result.cancelled) {
				this.notify.warn('Stockfish analysis cancellation requested.');
			} else {
				this.notify.info('No Stockfish analysis is currently running.');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.notify.error(`Failed to cancel analysis: ${message}`);
		} finally {
			this.isCancelling.set(false);
		}
	}

	openAnalysisInformation(): void {
		if (!this.hasCurrentDbGame()) {
			return;
		}

		const data: ExplorerAnalysisOverviewDialogData = {
			currentDbGameId: this.currentDbGameId(),
			engineStatus: this.engineStatus(),
			settings: this.settings(),
			latestAnalysis: this.latestAnalysis(),
		};

		this.dialog.open(ExplorerAnalysisOverviewDialogComponent, {
			data,
			width: '760px',
			maxWidth: 'calc(100vw - 32px)',
			panelClass: 'app-confirm-dialog-panel',
			backdropClass: 'app-confirm-dialog-backdrop',
			autoFocus: false,
		});
	}

	private resolveCurrentAnalysisPly(
		currentNodeId: string,
		currentPly: number,
		rows: ExplorerMoveListRow[],
		variationsByNodeId: Record<string, ExplorerVariationLine[]>,
	): number {
		const mainlineTokens = this.getMainlineTokens(rows);
		const mainlineMatch = mainlineTokens.find((token) => token.nodeId === currentNodeId);

		if (mainlineMatch) {
			return mainlineMatch.ply;
		}

		if (currentPly <= 0) {
			return 0;
		}

		const variationOwnerNodeId = this.findTopLevelVariationOwnerNodeId(
			currentNodeId,
			variationsByNodeId,
			new Set<string>(),
		);

		if (!variationOwnerNodeId) {
			return Math.min(currentPly, this.getLastKnownMainlinePly(mainlineTokens));
		}

		const ownerMainlineToken = mainlineTokens.find(
			(token) => token.nodeId === variationOwnerNodeId,
		);

		if (ownerMainlineToken) {
			return ownerMainlineToken.ply;
		}

		return 0;
	}

	private getMainlineTokens(rows: ExplorerMoveListRow[]): ExplorerMoveToken[] {
		const tokens: ExplorerMoveToken[] = [];

		for (const row of rows) {
			if (row.white) {
				tokens.push(row.white);
			}

			if (row.black) {
				tokens.push(row.black);
			}
		}

		return tokens;
	}

	private getLastKnownMainlinePly(tokens: ExplorerMoveToken[]): number {
		return tokens.length > 0 ? tokens[tokens.length - 1].ply : 0;
	}

	private findTopLevelVariationOwnerNodeId(
		nodeId: string,
		variationsByNodeId: Record<string, ExplorerVariationLine[]>,
		visitedNodeIds: Set<string>,
	): string | null {
		if (visitedNodeIds.has(nodeId)) {
			return null;
		}

		visitedNodeIds.add(nodeId);

		for (const [ownerNodeId, lines] of Object.entries(variationsByNodeId)) {
			const containsNode = lines.some((line) =>
				line.tokens.some((token) => token.nodeId === nodeId),
			);

			if (!containsNode) {
				continue;
			}

			const upstreamOwnerNodeId = this.findTopLevelVariationOwnerNodeId(
				ownerNodeId,
				variationsByNodeId,
				visitedNodeIds,
			);

			return upstreamOwnerNodeId ?? ownerNodeId;
		}

		return null;
	}

	private async loadEngineMetadata(): Promise<void> {
		this.isLoadingEngine.set(true);

		try {
			const [engineStatus, settings] = await Promise.all([
				this.analysisService.getEngineStatus(),
				this.analysisService.getSettings(),
			]);

			this.engineStatus.set(engineStatus);
			this.settings.set(settings);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.loadError.set(message);
			this.notify.error(`Failed to load Stockfish status: ${message}`);
		} finally {
			this.isLoadingEngine.set(false);
		}
	}

	private async loadLatestAnalysisForGame(
		gameId: string | null,
		options: { silent: boolean },
	): Promise<void> {
		const seq = ++this.latestLoadSeq;

		if (!gameId) {
			this.latestAnalysis.set(null);
			this.loadError.set(null);
			this.isLoadingLatestAnalysis.set(false);
			return;
		}

		this.isLoadingLatestAnalysis.set(true);
		this.loadError.set(null);

		try {
			const result = await this.analysisService.getLatestGameAnalysis({ gameId });

			if (seq !== this.latestLoadSeq) {
				return;
			}

			if (!result.ok) {
				this.latestAnalysis.set(null);
				this.loadError.set(result.error.message);

				if (!options.silent) {
					this.notify.error(`Failed to load latest analysis: ${result.error.message}`);
				}

				return;
			}

			this.latestAnalysis.set(result.analysis);
		} catch (error) {
			if (seq !== this.latestLoadSeq) {
				return;
			}

			const message = error instanceof Error ? error.message : String(error);
			this.latestAnalysis.set(null);
			this.loadError.set(message);

			if (!options.silent) {
				this.notify.error(`Failed to load latest analysis: ${message}`);
			}
		} finally {
			if (seq === this.latestLoadSeq) {
				this.isLoadingLatestAnalysis.set(false);
			}
		}
	}
}
