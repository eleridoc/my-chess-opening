import { ExternalSite, ImportOptions, ImportedGameRaw } from '../types';

export interface GameImporter {
	readonly site: ExternalSite;
	importGames(options: ImportOptions): Promise<ImportedGameRaw[]>;
}
