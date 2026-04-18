export type ExplorerBoardArrowSource = 'my-next-moves' | 'opening-book' | 'stockfish';

export type ExplorerBoardArrowDisplayMode = 'off' | 'top3' | 'top5' | 'all';

export interface ExplorerBoardArrow {
	source: ExplorerBoardArrowSource;
	from: string;
	to: string;
	uci: string;
	label?: string;
	rank: number;
	weight: number;
}
