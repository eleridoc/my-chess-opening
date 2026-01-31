import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import type {
	GameInfoHeaderVm,
	GameInfoPlayerVm,
	PlayerSide,
} from '../../view-models/game-info-header.vm';

export type PlayerCardPosition = 'top' | 'bottom';

/**
 * PlayerInfoCardComponent (UI / Angular)
 *
 * Renders one player "card" in the Explorer left panel.
 *
 * Refactor note (V1.5.6.13):
 * - The component receives the SINGLE header VM (GameInfoHeaderVm)
 *   and a position ("top" | "bottom").
 * - The component decides which side (white/black) to render based on:
 *   header.boardOrientation (bottom side) + requested position.
 *
 * Responsibilities:
 * - Render the player identity line (name + optional elo).
 * - Render a left icon block (e.g., "me" indicator) based on player.isMe.
 * - Keep a reserved area for future content (captured pieces / material diff).
 *
 * Non-responsibilities:
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
	/** Single header VM (computed by the facade). */
	@Input({ required: true }) header!: GameInfoHeaderVm;

	/** Desired position within the panel. */
	@Input({ required: true }) position!: PlayerCardPosition;

	/**
	 * Side to render for this card.
	 * - bottom side = header.boardOrientation
	 * - top side = opposite
	 */
	get side(): PlayerSide {
		const bottom: PlayerSide = this.header.boardOrientation;
		const top: PlayerSide = bottom === 'white' ? 'black' : 'white';

		return this.position === 'bottom' ? bottom : top;
	}

	get player(): GameInfoPlayerVm {
		return this.header.players[this.side];
	}

	get isWhite(): boolean {
		return this.side === 'white';
	}
}
