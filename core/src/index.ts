// Core domain / services placeholder.
// We'll put PGN parsing, FEN logic, models, etc. here.

export * from './ipc';

export { ImportOrchestrator } from './import/ImportOrchestrator';
export { LichessImporter } from './import/importers/lichess/LichessImporter';
export { ChessComImporter } from './import/importers/chesscom/ChessComImporter';

export { ExternalSite } from './import/types';
export type {
	ImportOptions,
	ImportedGameRaw,
	ImportedGameMove,
	ImportedGamePlayer,
	GameSpeed,
} from './import/types';

export function coreIsReady(): string {
	return 'core layer is ready';
}
