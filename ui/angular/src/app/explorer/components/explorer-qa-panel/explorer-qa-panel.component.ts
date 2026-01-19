import { CommonModule } from '@angular/common';
import {
	Component,
	EventEmitter,
	Output,
	computed,
	effect,
	signal,
	isDevMode,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import type { PromotionPiece } from 'my-chess-opening-core/explorer';
import { ExplorerFacade } from '../../facade/explorer.facade';

type QaLogLevel = 'INFO' | 'WARN' | 'ERROR';

type QaLogEntry = {
	id: number;
	at: string; // ISO string
	level: QaLogLevel;
	message: string;
};

type QaCheckItem = {
	id: string;
	label: string;
	done: boolean;
};

@Component({
	selector: 'app-explorer-qa-panel',
	standalone: true,
	imports: [
		CommonModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatDividerModule,
		MatChipsModule,
		MatCheckboxModule,
	],
	templateUrl: './explorer-qa-panel.component.html',
	styleUrl: './explorer-qa-panel.component.scss',
})
export class ExplorerQaPanelComponent {
	/**
	 * QA / Debug panel for Explorer.
	 * - Dev-only by default (isDevMode()).
	 * - Collapsible with persisted state (localStorage).
	 * - Provides scenarios, stress actions, event log, and a smoke checklist.
	 *
	 * Important:
	 * - We inject ExplorerFacade instead of passing it via @Input.
	 *   This guarantees effects run in a valid injection context (no NG0203),
	 *   and it always uses the same facade instance as the Explorer page.
	 */

	@Output() collapsedChange = new EventEmitter<boolean>();

	private readonly storageKeyCollapsed = 'mco.explorer.qa.collapsed';

	readonly visible = signal<boolean>(isDevMode());
	readonly collapsed = signal<boolean>(this.readCollapsedFromStorage());

	private logSeq = 1;
	readonly logs = signal<QaLogEntry[]>([]);

	readonly checks = signal<QaCheckItem[]>([
		{ id: 'start-play-prev-next', label: 'start → play → prev/next', done: false },
		{ id: 'goto-ply', label: 'goToPly (several values)', done: false },
		{ id: 'variation', label: 'create a variation (branch)', done: false },
		{ id: 'illegal', label: 'illegal moves (at least 2)', done: false },
		{ id: 'fast-nav', label: 'fast navigation spam (next/prev)', done: false },
		{ id: 'fen-churn', label: 'FEN churn (rapid changes)', done: false },
		{ id: 'promotion', label: 'promotion pending + resolve', done: false },
	]);

	readonly fenShort = computed(() => {
		const fen = this.facade.fen();
		return fen.length > 40 ? `${fen.slice(0, 40)}…` : fen;
	});

	constructor(public readonly facade: ExplorerFacade) {
		// Emit initial collapsed state so the page can react if needed.
		queueMicrotask(() => this.collapsedChange.emit(this.collapsed()));

		// Effects must run inside an injection context -> constructor is OK.
		let init = false;

		effect(() => {
			const ply = this.facade.ply();
			const fen = this.facade.fen();

			if (!init) {
				init = true;
				this.addLog('INFO', `QA ready (ply=${ply})`);
				return;
			}

			this.addLog('INFO', `Session changed (ply=${ply}, fen=${fen.slice(0, 24)}…)`);
			this.devAsserts();
		});

		effect(() => {
			const err = this.facade.lastError();
			if (!err) return;
			this.addLog('ERROR', `Error: ${err.code} - ${err.message}`);
			this.devAsserts();
		});

		effect(() => {
			const pending = this.facade.promotionPending();
			if (!pending) return;
			this.addLog('WARN', `Promotion required: ${pending.from} → ${pending.to}`);
			this.devAsserts();
		});
	}

	// -------------------------------------------------------------------------
	// UI actions
	// -------------------------------------------------------------------------

	toggleCollapsed(): void {
		const next = !this.collapsed();
		this.collapsed.set(next);
		this.writeCollapsedToStorage(next);
		this.collapsedChange.emit(next);
	}

	clearLogs(): void {
		this.logs.set([]);
		this.addLog('INFO', 'Logs cleared');
	}

	toggleCheck(id: string): void {
		this.checks.update((prev) => prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));
	}

	// -------------------------------------------------------------------------
	// Scenarios
	// -------------------------------------------------------------------------

	loadInitial(): void {
		this.facade.reset();
		this.addLog('INFO', 'Scenario: reset to initial');
	}

	loadLongPgn(): void {
		const pgn = `
[Event "QA Long"]
[Site "?"]
[Date "2026.01.01"]
[Round "-"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 *
`.trim();

		this.facade.reset();
		this.facade.loadPgn(pgn, { name: 'QA Long PGN' });
		this.addLog('INFO', 'Scenario: load long PGN');
	}

	loadPromotionFen(): void {
		const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
		this.facade.reset();
		this.facade.loadFenForCase1(fen);
		this.addLog('INFO', 'Scenario: promotion position loaded (a7→a8)');
	}

	triggerPromotionAttempt(): void {
		const ok = this.facade.attemptMove({ from: 'a7', to: 'a8' });
		this.addLog('INFO', `Attempt move a7→a8 (ok=${ok})`);
	}

	confirmPromotion(piece: PromotionPiece): void {
		this.facade.confirmPromotion(piece);
		this.addLog('INFO', `Confirm promotion: ${piece}`);
	}

	loadInCheckFen(): void {
		// Black to move, in check from the rook on e2.
		const fen = '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1';
		this.facade.reset();
		this.facade.loadFenForCase1(fen);
		this.addLog('INFO', 'Scenario: in-check position loaded');
	}

	tryIllegalMove(): void {
		const ok = this.facade.attemptMove({ from: 'e8', to: 'e7' });
		this.addLog('INFO', `Attempt illegal move e8→e7 (ok=${ok})`);
	}

	createVariationAtPly1(): void {
		this.facade.reset();

		// Mainline: 1.e4 e5
		this.facade.attemptMove({ from: 'e2', to: 'e4' });
		this.facade.attemptMove({ from: 'e7', to: 'e5' });

		// Go back to ply 1 (after 1.e4), then branch: 1...c5
		this.facade.goToPly(1);
		this.facade.attemptMove({ from: 'c7', to: 'c5' });

		this.addLog('INFO', 'Scenario: variation created at ply 1 (…e5 vs …c5)');
	}

	// -------------------------------------------------------------------------
	// Stress actions
	// -------------------------------------------------------------------------

	nextSpam(n = 30): void {
		let steps = 0;
		while (steps < n && this.facade.canNext()) {
			this.facade.goNext();
			steps++;
		}
		this.addLog('INFO', `Stress: next spam (${steps}/${n})`);
	}

	prevSpam(n = 30): void {
		let steps = 0;
		while (steps < n && this.facade.canPrev()) {
			this.facade.goPrev();
			steps++;
		}
		this.addLog('INFO', `Stress: prev spam (${steps}/${n})`);
	}

	goToPly(ply: number): void {
		this.facade.goToPly(ply);
		this.addLog('INFO', `Action: goToPly(${ply})`);
	}

	// -------------------------------------------------------------------------
	// Internals
	// -------------------------------------------------------------------------

	private addLog(level: QaLogLevel, message: string): void {
		const entry: QaLogEntry = {
			id: this.logSeq++,
			at: new Date().toISOString(),
			level,
			message,
		};

		// Use update() to avoid reading logs() inside effects (prevents loops).
		this.logs.update((prev) => [entry, ...prev].slice(0, 120));
	}

	private devAsserts(): void {
		if (!isDevMode()) return;

		const ply = this.facade.ply();
		const moves = this.facade.moves();

		console.assert(ply >= 0, '[DEV ASSERT] ply must be >= 0', { ply });
		console.assert(ply <= moves.length, '[DEV ASSERT] ply must be <= moves.length', {
			ply,
			movesLen: moves.length,
		});
	}

	private readCollapsedFromStorage(): boolean {
		try {
			return window.localStorage.getItem(this.storageKeyCollapsed) === '1';
		} catch {
			return false;
		}
	}

	private writeCollapsedToStorage(v: boolean): void {
		try {
			window.localStorage.setItem(this.storageKeyCollapsed, v ? '1' : '0');
		} catch {
			// ignore
		}
	}
}
