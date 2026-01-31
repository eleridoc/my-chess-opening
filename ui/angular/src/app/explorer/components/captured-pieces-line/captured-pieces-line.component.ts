import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import type {
	CapturedAvailabilityKey,
	CapturedCountsVm,
	CapturedPieceKind,
	PlayerSide,
} from '../../view-models/game-info-header.vm';

type CapturedEntry = {
	kind: CapturedPieceKind;
	count: number;
	/** Sprite id inside the cm-chessboard SVG sprite (e.g. "bp", "wn"). */
	spriteId: string;
};

/**
 * CapturedPiecesLineComponent (UI / Angular)
 *
 * Renders the "captured pieces" line under a player card.
 *
 * Data model:
 * - `counts` represent pieces CAPTURED BY the current player (not pieces lost).
 * - Captured pieces are rendered using the cm-chessboard SVG sprite (standard.svg).
 * - `materialAdvantage` is computed upstream (facade/player card) as a promotion-safe
 *   material diff based on the CURRENT BOARD at the cursor.
 *
 * Display rules:
 * - Only show a piece entry when its count > 0.
 * - Hide the "×1" marker in the template (layout is handled by CSS).
 * - Show "+X" only when X > 0 (leader only), hidden otherwise.
 */
@Component({
	selector: 'app-captured-pieces-line',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './captured-pieces-line.component.html',
	styleUrls: ['./captured-pieces-line.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CapturedPiecesLineComponent {
	/**
	 * Availability of captured pieces data.
	 * For FEN imports, this is "not_applicable" (no move history).
	 */
	@Input({ required: true }) availability!: CapturedAvailabilityKey;

	/**
	 * Captured piece counts for the current player (captured BY that player).
	 * Only meaningful when availability === "available".
	 */
	@Input() counts?: CapturedCountsVm;

	/**
	 * Promotion-safe material advantage for the current player.
	 * The component only displays it (no computation here).
	 */
	@Input() materialAdvantage?: number;

	/**
	 * Side of the player owning this line.
	 *
	 * Captured pieces are always the opponent's color:
	 * - white player captures black pieces => sprite ids "b*"
	 * - black player captures white pieces => sprite ids "w*"
	 */
	@Input({ required: true }) playerSide!: PlayerSide;

	/**
	 * IMPORTANT:
	 * Do NOT reference node_modules paths at runtime.
	 * The Angular build copies cm-chessboard assets to: "assets/cm-chessboard".
	 */
	private readonly piecesSpriteUrl = 'assets/cm-chessboard/pieces/standard.svg';

	/** Required ordering: pawns, knights, bishops, rooks, queens. */
	private static readonly PIECE_ORDER: CapturedPieceKind[] = ['p', 'n', 'b', 'r', 'q'];

	/**
	 * Sprite prefix for CAPTURED pieces (opponent color).
	 * - playerSide="white" => captured pieces are black => "b"
	 * - playerSide="black" => captured pieces are white => "w"
	 */
	private get capturedSpritePrefix(): 'w' | 'b' {
		return this.playerSide === 'white' ? 'b' : 'w';
	}

	/**
	 * Used for styling: black piece sprites often require a light outline on dark themes.
	 * "capturedIsBlack" refers to the CAPTURED pieces color, not the player side.
	 */
	get capturedIsBlack(): boolean {
		return this.capturedSpritePrefix === 'b';
	}

	private toSpriteId(kind: CapturedPieceKind): string {
		// Example: kind="p" => "bp" or "wp"
		return `${this.capturedSpritePrefix}${kind}`;
	}

	getSpriteHref(spriteId: string): string {
		return `${this.piecesSpriteUrl}#${spriteId}`;
	}

	/**
	 * Compact list of captured pieces to render.
	 * - Empty when availability !== "available" or when counts are missing.
	 * - Only includes pieces with count > 0.
	 */
	get entries(): CapturedEntry[] {
		if (this.availability !== 'available') return [];
		const c = this.counts;
		if (!c) return [];

		const out: CapturedEntry[] = [];
		for (const kind of CapturedPiecesLineComponent.PIECE_ORDER) {
			const count = c[kind] ?? 0;
			if (count > 0) out.push({ kind, count, spriteId: this.toSpriteId(kind) });
		}
		return out;
	}

	get hasCaptures(): boolean {
		return this.entries.length > 0;
	}

	get hasMaterialAdvantage(): boolean {
		return typeof this.materialAdvantage === 'number' && this.materialAdvantage > 0;
	}

	/**
	 * Backward-compatible alias (in case the template still uses `hasAdvantage`).
	 * Prefer `hasMaterialAdvantage` for clarity.
	 */
	get hasAdvantage(): boolean {
		return this.hasMaterialAdvantage;
	}
}
