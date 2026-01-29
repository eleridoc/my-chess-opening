import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { ExplorerFacade } from '../../facade/explorer.facade';

import { GameMetaHeaderCardComponent } from '../game-meta-header-card/game-meta-header-card.component';
import { GameDetailsRowsComponent } from '../game-details-rows/game-details-rows.component';
import { PlayerInfoCardComponent } from '../player-info-card/player-info-card.component';

/**
 * ExplorerGameInfoPanelComponent (UI / Angular)
 *
 * Thin container component that renders the "left column" game info panel:
 * - Game meta header (time control, rated, speed, playedAtIso, etc.)
 * - Player cards (top/bottom, already ordered by the facade based on board orientation)
 * - Game details rows (site link, result, opening/ECO)
 *
 * Responsibilities:
 * - Composition and layout only (no domain logic).
 * - Consume view-models exposed by ExplorerFacade.
 *
 * Non-responsibilities:
 * - No parsing/mapping of headers (handled by core + facade).
 * - No business rules (e.g., "owner at bottom" logic is handled upstream).
 */
@Component({
	selector: 'app-explorer-game-info-panel',
	standalone: true,
	imports: [
		CommonModule,
		GameMetaHeaderCardComponent,
		PlayerInfoCardComponent,
		GameDetailsRowsComponent,
	],
	templateUrl: './explorer-game-info-panel.component.html',
	styleUrls: ['./explorer-game-info-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerGameInfoPanelComponent {
	/**
	 * Facade instance provided by the parent (page/shell).
	 * We keep it as an input to make this component reusable in different contexts
	 * (Explorer page, QA panel, etc.).
	 */
	@Input({ required: true }) facade!: ExplorerFacade;
}
