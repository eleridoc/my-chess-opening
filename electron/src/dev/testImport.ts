import {
	ImportOrchestrator,
	LichessImporter,
	ChessComImporter,
	ExternalSite,
} from 'my-chess-opening-core';

import { prisma } from '../db/prisma';
import { importAllAccounts } from '../import/importAllAccounts';

export async function testImportAllAccountsMax5() {
	// Run a safe import (API-friendly): at most 5 games per enabled account
	await importAllAccounts({ maxGamesPerAccount: 5 });

	// Read the latest import runs to confirm the run happened and to get a quick summary.
	// We take a bit more than the expected count to be safe.
	const runs = await prisma.importRun.findMany({
		orderBy: { startedAt: 'desc' },
		take: 20,
		include: {
			accountConfig: true,
		},
	});

	console.log('====================');
	console.log('[TEST importAllAccounts max=5] Latest ImportRuns');
	console.log('====================');

	for (const r of runs) {
		console.log(
			`[RUN] ${r.accountConfig.site}:${r.accountConfig.username} ` +
				`status=${r.status} startedAt=${r.startedAt.toISOString()} ` +
				`found=${r.gamesFound} inserted=${r.gamesInserted} skipped=${r.gamesSkipped} failed=${r.gamesFailed}`,
		);

		// In test mode, the importer should never insert more than 5 games per account.
		if (r.gamesInserted > 5) {
			throw new Error(
				`Expected gamesInserted <= 5 for ${r.accountConfig.site}:${r.accountConfig.username}, got ${r.gamesInserted}`,
			);
		}
	}

	// Optional: read the most recent log entries to ensure logs are being written
	const logs = await prisma.importLogEntry.findMany({
		orderBy: { createdAt: 'desc' },
		take: 50,
	});

	console.log('====================');
	console.log('[TEST importAllAccounts max=5] Latest ImportLogEntry');
	console.log('====================');

	for (const l of logs) {
		console.log(
			`[LOG] ${l.createdAt.toISOString()} level=${l.level} scope=${l.scope ?? ''} ` +
				`site=${l.site ?? ''} user=${l.username ?? ''} ext=${l.externalId ?? ''} msg=${l.message}`,
		);
	}
}

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
	// console.log(
	// 	// games.map((g) => ({
	// 	// 	site: g.site,
	// 	// 	id: g.externalId,
	// 	// 	playedAt: g.playedAt.toISOString(),
	// 	// 	tc: g.timeControl,
	// 	// 	result: g.result,
	// 	// 	white: g.players[0].username,
	// 	// 	black: g.players[1].username,
	// 	// })),

	// 	games,
	// );

	const lastTwo = games.slice(0, 2); // assuming games are sorted newest -> oldest

	for (const g of lastTwo) {
		console.log('========================================');
		console.log(`[GAME] ${g.site}:${g.externalId}`);
		console.log(`playedAt=${g.playedAt.toISOString()} tc=${g.timeControl} result=${g.result}`);
		console.log(
			`white=${g.players[0].username} (${g.players[0].elo ?? '?'}) vs black=${g.players[1].username} (${g.players[1].elo ?? '?'})`,
		);
		console.log(`moves=${g.moves?.length ?? 0}`);

		const moves = g.moves ?? [];
		// Print first 12 plies and last 12 plies to avoid flooding logs
		const head = moves.slice(0, 12);
		const tail = moves.length > 24 ? moves.slice(-12) : moves.slice(12);

		const printMoves = (label: string, arr: typeof moves) => {
			if (!arr.length) return;
			console.log(`--- ${label} ---`);
			for (const m of arr) {
				const fenShort = m.fen ? m.fen.split(' ').slice(0, 2).join(' ') : '';
				console.log(
					`ply=${m.ply} san=${m.san} uci=${m.uci ?? ''} clockMs=${m.clockMs ?? ''} ` +
						`hash=${m.positionHash?.slice(0, 10) ?? ''} fen=${fenShort}`,
				);
			}
		};

		printMoves('HEAD', head);
		printMoves('TAIL', tail);
	}
}
