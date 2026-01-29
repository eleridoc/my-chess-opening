import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import {
	Component,
	EventEmitter,
	Output,
	computed,
	effect,
	isDevMode,
	signal,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import type { PromotionPiece, ExplorerGameSnapshot } from 'my-chess-opening-core/explorer';
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

const DEMO_DB_SNAPSHOT_001: ExplorerGameSnapshot = {
	schemaVersion: 1,
	kind: 'DB',
	gameId: 'demo-001',
	headers: {
		event: 'Demo',
		site: 'Local QA',
		playedAtIso: '2013-02-04T22:44:30.652Z',
		white: 'White Demo',
		black: 'Black Demo',
		result: '*',
		whiteElo: '1200',
		blackElo: '1350',
		opening: 'Ruy Lopez (demo)',
	},
	myColor: 'white',
	movesSan: [
		'e4',
		'e5',
		'Nf3',
		'Nc6',
		'Bb5',
		'a6',
		'Ba4',
		'Nf6',
		'O-O',
		'Be7',
		'Re1',
		'b5',
		'Bb3',
		'd6',
		'c3',
		'O-O',
		'h3',
		'Nb8',
		'd4',
		'Nbd7',
	],
};

const DEMO_DB_SNAPSHOT_002: ExplorerGameSnapshot = {
	schemaVersion: 1,
	kind: 'DB',
	gameId: 'demo-002',
	headers: {
		event: 'Demo',
		site: 'Local QA',
		playedAtIso: '2013-02-04T22:44:30.652Z',
		white: 'White Demo 2',
		black: 'Black Demo 2',
		result: '*',
		whiteElo: '1200',
		blackElo: '1350',
		opening: 'Italian Game (demo)',
	},
	myColor: 'black',
	movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+'],
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
	private readonly router = inject(Router);

	/**
	 * QA / Debug panel for Explorer.
	 *
	 * Design:
	 * - Dev-only by default (isDevMode()).
	 * - Collapsible with persisted state (localStorage).
	 * - Provides scenarios, stress actions, event log, and a smoke checklist.
	 *
	 * Note:
	 * - We inject ExplorerFacade instead of passing it via @Input.
	 *   This ensures effects always run in a valid injection context
	 *   and the panel uses the same facade instance as the Explorer page.
	 */

	// -------------------------------------------------------------------------
	// Outputs (page can react to collapsed state changes)
	// -------------------------------------------------------------------------

	@Output() collapsedChange = new EventEmitter<boolean>();

	// -------------------------------------------------------------------------
	// Persisted UI state
	// -------------------------------------------------------------------------

	private readonly storageKeyCollapsed = 'mco.explorer.qa.collapsed';

	/** Whether the QA panel should be displayed at all (dev-only default). */
	readonly visible = signal<boolean>(isDevMode());

	/** Collapsed UI state (persisted in localStorage). */
	readonly collapsed = signal<boolean>(this.readCollapsedFromStorage());

	// -------------------------------------------------------------------------
	// Logs & checklist state
	// -------------------------------------------------------------------------

	private logSeq = 1;

	/** Latest entries first (bounded to avoid unlimited growth). */
	readonly logs = signal<QaLogEntry[]>([]);

	/** Simple smoke checklist to validate interactions quickly. */
	readonly checks = signal<QaCheckItem[]>([
		{ id: 'start-play-prev-next', label: 'start → play → prev/next', done: false },
		{ id: 'goto-ply', label: 'goToPly (several values)', done: false },
		{ id: 'variation', label: 'create a variation (branch)', done: false },
		{ id: 'illegal', label: 'illegal moves (at least 2)', done: false },
		{ id: 'fast-nav', label: 'fast navigation spam (next/prev)', done: false },
		{ id: 'fen-churn', label: 'FEN churn (rapid changes)', done: false },
		{ id: 'promotion', label: 'promotion pending + resolve', done: false },
	]);

	/** Short FEN display for chips (keeps the card readable). */
	readonly fenShort = computed(() => {
		const fen = this.facade.fen();
		return fen.length > 40 ? `${fen.slice(0, 40)}…` : fen;
	});

	constructor(public readonly facade: ExplorerFacade) {
		// Emit initial collapsed state so parent can adapt layout if needed.
		queueMicrotask(() => this.collapsedChange.emit(this.collapsed()));

		// Effects must run inside an injection context -> constructor is OK.
		let initialized = false;

		// Session changes: log and run dev asserts.
		effect(() => {
			const ply = this.facade.ply();
			const fen = this.facade.fen();

			if (!initialized) {
				initialized = true;
				this.addLog('INFO', `QA ready (ply=${ply})`);
				return;
			}

			this.addLog('INFO', `Session changed (ply=${ply}, fen=${fen.slice(0, 24)}…)`);
			this.devAsserts();
		});

		// Core errors: log as ERROR.
		effect(() => {
			const err = this.facade.lastError();
			if (!err) return;
			this.addLog('ERROR', `Error: ${err.code} - ${err.message}`);
			this.devAsserts();
		});

		// Promotion workflow: log as WARN.
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
	// Variation helpers (uses core navigation rules via the facade)
	// -------------------------------------------------------------------------

	prevVariation(): void {
		this.facade.goPrevVariation();
		this.addLog('INFO', 'Action: prevVariation()');
	}

	nextVariation(): void {
		this.facade.goNextVariation();
		this.addLog('INFO', 'Action: nextVariation()');
	}

	// -------------------------------------------------------------------------
	// Scenarios (quick setups for manual testing)
	// -------------------------------------------------------------------------

	loadDemoDbSnapshot001(): void {
		this.facade.loadDbGameSnapshot(DEMO_DB_SNAPSHOT_001);
	}

	loadDemoDbSnapshot002(): void {
		this.facade.loadDbGameSnapshot(DEMO_DB_SNAPSHOT_002);
	}

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
		// White to move: pawn on a7 can promote on a8.
		const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
		this.facade.reset();
		this.facade.loadFenForCase1(fen);
		this.addLog('INFO', 'Scenario: promotion position loaded (a7→a8)');
	}

	triggerPromotionAttempt(): void {
		// Intentionally missing promotion piece -> should trigger PROMOTION_REQUIRED.
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

		// Branch at ply 1 (after 1.e4): create 1...c5
		this.facade.goToPly(1);
		this.facade.attemptMove({ from: 'c7', to: 'c5' });

		this.addLog('INFO', 'Scenario: variation created at ply 1 (…e5 vs …c5)');
	}

	loadPgnWithElos(): void {
		const pgn = `
[Event "QA Elo"]
[Site "Local QA"]
[Date "2026.01.29"]
[Round "-"]
[White "Alice"]
[Black "Bob"]
[WhiteElo "1532"]
[BlackElo "1684"]
[Result "*"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *
`.trim();

		this.facade.reset();
		this.facade.loadPgn(pgn, { name: 'QA PGN with Elo' });
		this.addLog('INFO', 'Scenario: load PGN with Elo tags');
	}

	// -------------------------------------------------------------------------
	// Stress actions (rapid navigation)
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

	navigateExplorerWithDbGameId(gameId: string): void {
		void this.router.navigate(['/explorer'], {
			queryParams: { dbGameId: gameId },
			queryParamsHandling: 'merge',
		});
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

	/**
	 * Lightweight assertions for dev builds only.
	 * Helps detect session/model drift while iterating quickly.
	 */
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
			// ignore (storage might be blocked)
		}
	}
}
