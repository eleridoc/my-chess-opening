import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import type { PlayerInfoVm } from '../../view-models/player-info.vm';

/**
 * PlayerInfoCardComponent (UI / Angular)
 *
 * Renders one player "card" (either White or Black) in the Explorer left panel.
 *
 * The component is presentation-only:
 * - It receives a PlayerInfoVm precomputed by the facade.
 * - It derives a few convenience booleans/labels for template bindings.
 *
 * Responsibilities:
 * - Render the player identity line (name + optional elo).
 * - Render a left icon block (e.g., "me" indicator) based on vm.isMe.
 * - Provide a reserved area for future content (captured pieces / material diff).
 *
 * Non-responsibilities:
 * - Determining who "me" is (handled by facade + DB snapshot perspective).
 * - Any chess logic (captures, evaluation, etc.).
 */
@Component({
	selector: 'app-player-info-card',
	standalone: true,
	imports: [CommonModule, MatIconModule],
	templateUrl: './player-info-card.component.html',
	styleUrls: ['./player-info-card.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerInfoCardComponent {
	/** View-model to render (precomputed by the facade). */
	@Input({ required: true }) vm!: PlayerInfoVm;

	/** Convenience: true when this card represents the White side. */
	get isWhite(): boolean {
		return this.vm.side === 'white';
	}

	/**
	 * Human-friendly side label.
	 * Keep it in English (no translations yet).
	 */
	get sideLabel(): string {
		return this.isWhite ? 'White' : 'Black';
	}
}
