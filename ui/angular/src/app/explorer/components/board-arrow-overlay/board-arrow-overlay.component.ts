import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import type { BoardOrientation } from '../../board/board-adapter';
import type { ExplorerBoardArrow } from '../../board/board-arrows.types';

type BoardPoint = {
	x: number;
	y: number;
};

type ArrowLine = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

@Component({
	selector: 'app-board-arrow-overlay',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './board-arrow-overlay.component.html',
	styleUrl: './board-arrow-overlay.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardArrowOverlayComponent {
	@Input() orientation: BoardOrientation = 'white';
	@Input() arrows: ExplorerBoardArrow[] = [];

	trackByArrow(_index: number, arrow: ExplorerBoardArrow): string {
		return `${arrow.source}::${arrow.rank}::${arrow.uci}`;
	}

	getMarkerId(arrow: ExplorerBoardArrow): string {
		return `board-arrow-marker-${arrow.source}-${arrow.rank}-${arrow.uci}`;
	}

	getArrowColor(arrow: ExplorerBoardArrow): string {
		const alpha = this.getArrowAlpha(arrow.rank);

		switch (arrow.source) {
			case 'opening-book':
				return `rgba(86, 196, 124, ${alpha})`;
			case 'stockfish':
				return `rgba(255, 178, 66, ${alpha})`;
			case 'my-next-moves':
			default:
				return `rgba(77, 147, 255, ${alpha})`;
		}
	}

	getStrokeWidth(arrow: ExplorerBoardArrow): number {
		const normalizedWeight = Math.max(0, Math.min(100, arrow.weight));
		return 1.8 + normalizedWeight * 0.018;
	}

	getArrowLine(arrow: ExplorerBoardArrow): ArrowLine {
		const from = this.getSquareCenter(arrow.from);
		const to = this.getSquareCenter(arrow.to);

		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const length = Math.hypot(dx, dy) || 1;

		const startOffset = 2.0;
		const endOffset = 3.4;

		return {
			x1: from.x + (dx / length) * startOffset,
			y1: from.y + (dy / length) * startOffset,
			x2: to.x - (dx / length) * endOffset,
			y2: to.y - (dy / length) * endOffset,
		};
	}

	private getArrowAlpha(rank: number): number {
		switch (rank) {
			case 1:
				return 0.95;
			case 2:
				return 0.78;
			case 3:
				return 0.64;
			case 4:
				return 0.54;
			case 5:
				return 0.46;
			default:
				return 0.36;
		}
	}

	private getSquareCenter(square: string): BoardPoint {
		const fileChar = square?.[0]?.toLowerCase();
		const rankChar = square?.[1];

		const fileIndex = fileChar ? fileChar.charCodeAt(0) - 97 : 0;
		const rankIndex = rankChar ? Number(rankChar) - 1 : 0;

		const safeFile = Math.max(0, Math.min(7, fileIndex));
		const safeRank = Math.max(0, Math.min(7, rankIndex));

		if (this.orientation === 'black') {
			return {
				x: (7 - safeFile + 0.5) * 12.5,
				y: (safeRank + 0.5) * 12.5,
			};
		}

		return {
			x: (safeFile + 0.5) * 12.5,
			y: (7 - safeRank + 0.5) * 12.5,
		};
	}
}
