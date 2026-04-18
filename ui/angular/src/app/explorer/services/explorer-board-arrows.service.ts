import { Injectable, computed, signal } from '@angular/core';

import type {
	ExplorerBoardArrow,
	ExplorerBoardArrowDisplayMode,
	ExplorerBoardArrowSource,
} from '../board/board-arrows.types';

const STORAGE_KEY_PREFIX = 'mco.explorer.board-arrows.mode.';

const ALL_ARROW_SOURCES: ExplorerBoardArrowSource[] = [
	'my-next-moves',
	'opening-book',
	'stockfish',
];

function loadStoredArrowMode(source: ExplorerBoardArrowSource): ExplorerBoardArrowDisplayMode {
	try {
		const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${source}`);
		if (raw === 'off' || raw === 'top3' || raw === 'top5' || raw === 'all') {
			return raw;
		}
	} catch {
		// ignore storage errors
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

	private readonly activeSourceState = signal<ExplorerBoardArrowSource | null>(null);

	readonly visibleArrows = computed(() => {
		const activeSource = this.activeSourceState();

		if (!activeSource) {
			return [];
		}

		const mode = this.sourceModesState()[activeSource];
		const arrows = this.sourceArrowsState()[activeSource];

		if (mode === 'off' || arrows.length === 0) {
			return [];
		}

		if (mode === 'top3') {
			return arrows.slice(0, 3);
		}

		if (mode === 'top5') {
			return arrows.slice(0, 5);
		}

		return arrows;
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
			// ignore storage errors
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
	}
}
