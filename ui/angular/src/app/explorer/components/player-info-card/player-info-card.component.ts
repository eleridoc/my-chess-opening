import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CapturedPiecesLineComponent } from '../captured-pieces-line/captured-pieces-line.component';

import type {
	CapturedAvailabilityKey,
	CapturedCountsVm,
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
 * Inputs:
 * - `header`: the single GameInfoHeaderVm produced by the facade
 * - `position`: where the card is placed in the panel ("top" | "bottom")
 *
 * Side resolution:
 * - bottom side = header.boardOrientation
 * - top side    = opposite of boardOrientation
 *
 * Responsibilities:
 * - Render player identity (name + optional elo).
 * - Render a left icon block (e.g., "me" indicator) based on player.isMe.
 * - Expose captured pieces data (counts) and the material advantage "+X".
 *
 * Non-responsibilities:
 * - No chess logic and no computations based on move history.
 *   (All domain computations should happen in the core or facade.)
 */
@Component({
	selector: 'app-player-info-card',
	standalone: true,
	imports: [CommonModule, MatIconModule, CapturedPiecesLineComponent],
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

	/**
	 * Captured pieces availability for the current session.
	 * - "not_applicable" for FEN imports (no move history)
	 */
	get capturedAvailability(): CapturedAvailabilityKey {
		return this.header.captured?.availability ?? 'not_applicable';
	}

	/**
	 * Captured piece counts for the player rendered by this card.
	 * Meaning: pieces captured BY this player (not pieces lost).
	 */
	get capturedCounts(): CapturedCountsVm | undefined {
		if (this.capturedAvailability !== 'available') return undefined;
		return this.header.captured?.bySide?.[this.side];
	}

	/**
	 * Material advantage for the player rendered by this card.
	 *
	 * Important:
	 * - This uses `header.material` which is computed from pieces currently present
	 *   on the board at the cursor (promotion-safe).
	 * - It is NOT derived from capture history.
	 *
	 * Display rule:
	 * - Show "+X" only for the leading side
	 * - Show nothing for the other side
	 * - Show nothing on ties
	 */
	get materialAdvantage(): number | undefined {
		const m = this.header.material;
		if (!m) return undefined;

		if (!m.leadingSide || m.diff <= 0) return undefined;
		return m.leadingSide === this.side ? m.diff : undefined;
	}
}
