import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';

import type { AnalysisEngineStatus, AnalysisSettings } from 'my-chess-opening-core';

/**
 * Displays current database game information and active Stockfish metadata.
 */
@Component({
	selector: 'app-explorer-analysis-overview',
	standalone: true,
	imports: [CommonModule, MatIconModule],
	templateUrl: './explorer-analysis-overview.component.html',
	styleUrl: './explorer-analysis-overview.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerAnalysisOverviewComponent {
	@Input() currentDbGameId: string | null = null;
	@Input() engineStatus: AnalysisEngineStatus | null = null;
	@Input() settings: AnalysisSettings | null = null;

	shortGameId(gameId: string): string {
		return gameId.length > 12 ? `${gameId.slice(0, 12)}…` : gameId;
	}

	formatSettingsMode(settings: AnalysisSettings): string {
		if (settings.mode === 'depth') {
			return `Depth ${settings.depth}`;
		}

		return `${settings.movetimeMs} ms / position`;
	}
}
