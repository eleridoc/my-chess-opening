import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { ExplorerFacade } from '../../facade/explorer.facade';

import { GameMetaHeaderCardComponent } from '../game-meta-header-card/game-meta-header-card.component';
import { PlayerInfoCardComponent } from '../player-info-card/player-info-card.component';

import { ExternalLinkService } from '../../../shared/system/external-link.service';
import type { GameResultKey, GameSpeedKey } from '../../view-models/game-info-header.vm';

/**
 * ExplorerGameInfoPanelComponent (UI / Angular)
 *
 * Thin container component that renders the "left column" game info panel:
 * - Game meta header (time control, rated, speed, playedAtIso, etc.)
 * - Player cards (top/bottom ordering is derived from header.boardOrientation inside the player card component).
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
	imports: [CommonModule, GameMetaHeaderCardComponent, PlayerInfoCardComponent],
	templateUrl: './explorer-game-info-panel.component.html',
	styleUrls: ['./explorer-game-info-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerGameInfoPanelComponent {
	private readonly externalLink = inject(ExternalLinkService);

	/**
	 * Facade instance provided by the parent (page/shell).
	 * We keep it as an input to make this component reusable in different contexts
	 * (Explorer page, QA panel, etc.).
	 */
	@Input({ required: true }) facade!: ExplorerFacade;

	/**
	 * Opens an external URL using the Electron-safe external link service.
	 * The template may forward the click event to prevent default navigation.
	 */
	openExternal(url: string | undefined, event?: Event): void {
		if (!url) return;
		this.externalLink.open(url, event);
	}

	/**
	 * Temporary English label mapping (will be replaced by i18n later).
	 */
	resultText(key: GameResultKey | undefined): string {
		if (key === 'white_win') return 'White wins';
		if (key === 'black_win') return 'Black wins';
		if (key === 'draw') return 'Draw';
		if (key === 'ongoing') return 'Ongoing';
		return '—';
	}

	/**
	 * Temporary English label mapping (will be replaced by i18n later).
	 */
	siteFallbackLabel(siteKey: 'lichess' | 'chesscom' | 'unknown' | undefined): string {
		if (siteKey === 'lichess') return 'Lichess';
		if (siteKey === 'chesscom') return 'Chess.com';
		return '—';
	}
}
