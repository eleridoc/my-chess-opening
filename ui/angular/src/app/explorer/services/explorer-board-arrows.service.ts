import { Injectable, computed, signal } from '@angular/core';

import type {
	ExplorerBoardArrow,
	ExplorerBoardArrowDisplayMode,
	ExplorerBoardArrowSource,
} from '../board/board-arrows.types';

const STORAGE_KEY_PREFIX = 'mco.explorer.board-arrows.mode.';

function loadStoredArrowMode(source: ExplorerBoardArrowSource): ExplorerBoardArrowDisplayMode {
	try {
		const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${source}`);
		if (raw === 'off' || raw === 'top3' || raw === 'top5' || raw === 'all') {
			return raw;
		}
	} catch {
		// Ignore storage errors.
	}

	return 'off';
}

@Injectable({ providedIn: 'root' })
export class ExplorerBoardArrowsService {
	private readonly sourceModesState = signal<
		Record<ExplorerBoardArrowSource, ExplorerBoardArrowDisplayMode>
	>({
		'my-next-moves': loadStoredArrowMode('my-next-moves'),
		'opening-book': loadStoredArrowMode('opening-book'),
		stockfish: loadStoredArrowMode('stockfish'),
	});

	private readonly sourceArrowsState = signal<
		Record<ExplorerBoardArrowSource, ExplorerBoardArrow[]>
	>({
		'my-next-moves': [],
		'opening-book': [],
		stockfish: [],
	});

	private readonly hoveredArrowUciState = signal<Record<ExplorerBoardArrowSource, string | null>>({
		'my-next-moves': null,
		'opening-book': null,
		stockfish: null,
	});

	private readonly activeSourceState = signal<ExplorerBoardArrowSource | null>(null);

	readonly visibleArrows = computed(() => {
		const activeSource = this.activeSourceState();

		if (!activeSource) {
			return [];
		}

		const mode = this.sourceModesState()[activeSource];
		const allSourceArrows = this.sourceArrowsState()[activeSource];
		const hoveredUci = this.hoveredArrowUciState()[activeSource];

		if (mode === 'off' || allSourceArrows.length === 0) {
			return [];
		}

		let visible: ExplorerBoardArrow[];

		if (mode === 'top3') {
			visible = allSourceArrows.slice(0, 3);
		} else if (mode === 'top5') {
			visible = allSourceArrows.slice(0, 5);
		} else {
			visible = allSourceArrows.slice();
		}

		/**
		 * If the hovered move is not already visible because of the current mode,
		 * add it temporarily so the user still gets a board highlight while hovering
		 * the table row.
		 */
		if (hoveredUci) {
			const alreadyVisible = visible.some((arrow) => arrow.uci === hoveredUci);

			if (!alreadyVisible) {
				const hoveredArrow = allSourceArrows.find((arrow) => arrow.uci === hoveredUci);
				if (hoveredArrow) {
					visible = [hoveredArrow, ...visible];
				}
			}
		}

		return visible.map((arrow) => ({
			...arrow,
			isHighlighted: hoveredUci !== null && arrow.uci === hoveredUci,
		}));
	});

	getArrowMode(source: ExplorerBoardArrowSource): ExplorerBoardArrowDisplayMode {
		return this.sourceModesState()[source];
	}

	setArrowMode(source: ExplorerBoardArrowSource, mode: ExplorerBoardArrowDisplayMode): void {
		this.sourceModesState.update((current) => ({
			...current,
			[source]: mode,
		}));

		try {
			localStorage.setItem(`${STORAGE_KEY_PREFIX}${source}`, mode);
		} catch {
			// Ignore storage errors.
		}
	}

	setActiveSource(source: ExplorerBoardArrowSource | null): void {
		this.activeSourceState.set(source);
	}

	clearActiveSource(source: ExplorerBoardArrowSource): void {
		if (this.activeSourceState() === source) {
			this.activeSourceState.set(null);
		}
	}

	setSourceArrows(source: ExplorerBoardArrowSource, arrows: ExplorerBoardArrow[]): void {
		this.sourceArrowsState.update((current) => ({
			...current,
			[source]: arrows,
		}));
	}

	clearSourceArrows(source: ExplorerBoardArrowSource): void {
		this.sourceArrowsState.update((current) => ({
			...current,
			[source]: [],
		}));

		this.clearHoveredArrow(source);
	}

	setHoveredArrow(source: ExplorerBoardArrowSource, uci: string | null): void {
		this.hoveredArrowUciState.update((current) => ({
			...current,
			[source]: uci,
		}));
	}

	clearHoveredArrow(source: ExplorerBoardArrowSource): void {
		this.hoveredArrowUciState.update((current) => ({
			...current,
			[source]: null,
		}));
	}
}
