import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { ExternalLinkService } from '../../../shared/system/external-link.service';
import type { GameDetailsRowVm } from '../../view-models/game-meta.vm';

/**
 * GameDetailsRowsComponent (UI / Angular)
 *
 * Renders a list of small "label → value" rows used in the Explorer left panel.
 *
 * Typical rows:
 * - Site (clickable external link when available)
 * - Result (custom rendering handled in the template via row.kind/tone)
 * - Opening (optional)
 *
 * Responsibilities:
 * - Pure rendering + forwarding "open external link" intents to ExternalLinkService.
 *
 * Non-responsibilities:
 * - Building the rows (handled by ExplorerFacade).
 * - Deciding labels, values, or tones (handled upstream).
 */
@Component({
	selector: 'app-game-details-rows',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './game-details-rows.component.html',
	styleUrls: ['./game-details-rows.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameDetailsRowsComponent {
	/** View-model rows to render (precomputed by the facade). */
	@Input({ required: true }) rows!: GameDetailsRowVm[];

	private readonly externalLink = inject(ExternalLinkService);

	/**
	 * Opens a URL using the Electron-safe external link service.
	 * The template may pass the click event so the service can prevent default navigation.
	 */
	openExternal(url: string | null, event?: Event): void {
		this.externalLink.open(url, event);
	}
}
