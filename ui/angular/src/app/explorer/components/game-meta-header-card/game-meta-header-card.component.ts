import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import type { GameMetaHeaderVm } from '../../view-models/game-meta.vm';

/**
 * GameMetaHeaderCardComponent (UI / Angular)
 *
 * Displays a compact "game meta" header block in the Explorer left panel.
 *
 * The view-model is prepared by the facade and typically includes:
 * - an icon representing the speed / cadence (bullet, blitz, rapid, ...)
 * - a primary line (time control • rated/casual • speed label)
 * - a secondary line (playedAtIso in raw ISO for now)
 *
 * Responsibilities:
 * - Render the provided view-model.
 *
 * Non-responsibilities:
 * - Parsing PGN tags, mapping DB enums, or computing labels (handled upstream).
 * - Date formatting / localization (will be done later in UI using a dedicated lib).
 */
@Component({
	selector: 'app-game-meta-header-card',
	standalone: true,
	imports: [CommonModule, MatIconModule],
	templateUrl: './game-meta-header-card.component.html',
	styleUrls: ['./game-meta-header-card.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameMetaHeaderCardComponent {
	/** View-model to render (precomputed by the facade). */
	@Input({ required: true }) vm!: GameMetaHeaderVm;
}
