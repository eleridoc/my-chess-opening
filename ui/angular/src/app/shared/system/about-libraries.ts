/**
 * Main open-source libraries used by this project.
 *
 * This list is intentionally short and curated (not exhaustive).
 */
export type AboutLibrary = Readonly<{
	name: string;
	url: string;
	description: string;
}>;

/* later 
	{
		name: 'stockfish.wasm',
		url: 'https://github.com/lichess-org/stockfish.wasm',
		description: 'WebAssembly build of the Stockfish chess engine.',
	},
*/

export const ABOUT_LIBRARIES_CHESS: readonly AboutLibrary[] = [
	{
		name: 'chess.js',
		url: 'https://github.com/jhlywa/chess.js',
		description: 'Chess rules, legal moves, SAN/PGN/FEN helpers.',
	},
	{
		name: 'cm-chessboard',
		url: 'https://github.com/shaack/cm-chessboard',
		description: 'Lightweight SVG chessboard UI.',
	},
];

export const ABOUT_LIBRARIES_STACK: readonly AboutLibrary[] = [
	{
		name: 'Angular',
		url: 'https://github.com/angular/angular',
		description: 'UI framework (standalone components, routing).',
	},
	{
		name: 'Angular Material',
		url: 'https://github.com/angular/components',
		description: 'Material components and CDK.',
	},
	{
		name: 'Electron',
		url: 'https://github.com/electron/electron',
		description: 'Cross-platform desktop runtime.',
	},
	{
		name: 'Prisma',
		url: 'https://github.com/prisma/prisma',
		description: 'ORM + migrations for the local database.',
	},
	{
		name: 'RxJS',
		url: 'https://github.com/ReactiveX/rxjs',
		description: 'Reactive primitives used across the app.',
	},
	{
		name: 'Luxon',
		url: 'https://github.com/moment/luxon',
		description: 'Date/time utilities (parsing, zones, formatting helpers).',
	},
];
