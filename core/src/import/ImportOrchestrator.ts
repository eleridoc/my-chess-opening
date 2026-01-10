import { ExternalSite, ImportOptions, ImportedGameRaw } from './types';
import { GameImporter } from './importers/GameImporter';

export class ImportOrchestrator {
	private readonly importers = new Map<ExternalSite, GameImporter>();

	constructor(importers: GameImporter[]) {
		for (const imp of importers) {
			this.importers.set(imp.site, imp);
		}
	}

	async importGames(site: ExternalSite, options: ImportOptions): Promise<ImportedGameRaw[]> {
		const importer = this.importers.get(site);
		if (!importer) throw new Error(`No importer registered for site: ${site}`);
		return importer.importGames(options);
	}
}
