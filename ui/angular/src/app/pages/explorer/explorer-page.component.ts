import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ExplorerFacade } from '../../explorer/facade/explorer.facade';

@Component({
	selector: 'app-explorer-page',
	standalone: true,
	imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
	templateUrl: './explorer-page.component.html',
	styleUrl: './explorer-page.component.scss',
})
export class ExplorerPageComponent {
	constructor(public facade: ExplorerFacade) {}

	// Small move inputs
	from = 'e2';
	to = 'e4';

	// Debug loaders
	fenToLoad = '8/P7/8/8/8/8/8/k6K w - - 0 1';

	pgnToLoad = `[Event "Live Chess"]
[Site "Chess.com"]
[BlackTitle ""]

1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Nxc6 bxc6 7. Bg5 Be7 8.
Bc4 O-O 9. O-O Bb7 10. f4 $6 h6 $6 11. fxe5 hxg5 12. exf6 Bxf6 13. Qe1 $6 g6 $6 14.
e5 Re8 $4 15. Rxf6 Qxf6 16. exf6 Rxe1+ 17. Rxe1 1-0`;
	pgnName = 'debug-pgn';

	// --- DB loader (CASE2_DB) ---
	dbGameId = 'debug-game-1';
	dbMovesSanText = 'e4 e5 Nf3 Nc6';

	reset(): void {
		this.facade.reset();
	}

	play(): void {
		this.facade.attemptMove({ from: this.from, to: this.to });
	}

	loadFen(): void {
		this.facade.loadFenForCase1(this.fenToLoad);
	}

	loadPromoFen(): void {
		this.facade.loadFenForCase1('8/P7/8/8/8/8/8/k6K w - - 0 1');
	}

	loadPgn(): void {
		this.facade.loadPgn(this.pgnToLoad, { name: this.pgnName?.trim() || undefined });
	}

	loadDbGame(): void {
		const gameId = (this.dbGameId ?? '').trim();
		const tokens = (this.dbMovesSanText ?? '')
			.split(/\s+/g)
			.map((t) => t.trim())
			.filter(Boolean);

		// Keep it tolerant for debug input: remove common non-move tokens
		const movesSan = tokens.filter((t) => {
			if (/^\d+\.+$/.test(t)) return false; // "1." "2..."
			if (/^\$\d+$/.test(t)) return false; // NAG like "$6"
			if (/^(\*|1-0|0-1|1\/2-1\/2)$/.test(t)) return false; // results
			return true;
		});

		this.facade.loadGameMovesSan(movesSan, {
			gameId: gameId.length > 0 ? gameId : 'debug-game',
		});
	}
}
