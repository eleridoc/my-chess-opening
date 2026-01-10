import {
	ImportOrchestrator,
	LichessImporter,
	ChessComImporter,
	ExternalSite,
} from 'my-chess-opening-core';

export async function testImportSinceYesterday() {
	const orchestrator = new ImportOrchestrator([new LichessImporter(), new ChessComImporter()]);

	const since = new Date(Date.now() - 24 * 60 * 60 * 1000 * 63);

	const games = await orchestrator.importGames(ExternalSite.LICHESS, {
		username: 'eleridoc',
		since,
		ratedOnly: true,
		speeds: ['bullet', 'blitz', 'rapid'],
		includeMoves: true,
	});

	console.log(`[TEST IMPORT] since=${since.toISOString()} games=${games.length}`);
	console.log(
		// games.map((g) => ({
		// 	site: g.site,
		// 	id: g.externalId,
		// 	playedAt: g.playedAt.toISOString(),
		// 	tc: g.timeControl,
		// 	result: g.result,
		// 	white: g.players[0].username,
		// 	black: g.players[1].username,
		// })),

		games,
	);
}
