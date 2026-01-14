/**
 * Manual harness for ExplorerSession (V0.1.x)
 *
 * This script is NOT part of production builds.
 * It is used to validate core behavior quickly from the CLI:
 * - Session init (initial FEN)
 * - Move application (legal/illegal)
 * - Promotion required behavior
 * - Active line tracking
 * - Navigation (prev/next/start/end/goToPly)
 *
 * Run:
 *   npx tsx core/dev/test_version_0_1.ts
 */

import { ExplorerSession } from '../src/explorer/session';
import type { ExplorerApplyMoveFailure, ExplorerApplyMoveResult } from '../src/explorer/types';
import type { ExplorerResult } from '../src/explorer/types';

function assertResultFailure(
	result: ExplorerResult,
	message: string,
): asserts result is { ok: false; error: any } {
	if (result.ok) {
		throw new Error(`ASSERT FAILED: ${message}`);
	}
}

function assertFailure(
	result: ExplorerApplyMoveResult,
	message: string,
): asserts result is ExplorerApplyMoveFailure {
	if (result.ok) {
		throw new Error(`ASSERT FAILED: ${message}`);
	}
}

function expectFailure(
	result: ExplorerApplyMoveResult,
	expectedCode: string,
	label: string,
): ExplorerApplyMoveFailure {
	assertFailure(result, `${label} should fail`);
	assertEqual(result.error.code, expectedCode, `${label} should return ${expectedCode}`);
	console.log(`${label} error (expected):`, result.error);
	return result;
}

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(`ASSERT FAILED: ${message}`);
	}
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
	if (actual !== expected) {
		throw new Error(
			`ASSERT FAILED: ${message}\n  expected: ${expected}\n  actual:   ${actual}`,
		);
	}
}

function logStep(title: string): void {
	console.log(`\n=== ${title} ===`);
}

function main(): void {
	logStep('Init');
	const s = new ExplorerSession();

	assertEqual(s.getMode(), 'CASE1_FREE', 'mode should be CASE1_FREE at init');
	assertEqual(s.getCurrentPly(), 0, 'ply should be 0 at init');
	assert(s.getCurrentFen().includes(' w '), 'initial FEN should be white to move');

	console.log('Initial FEN:', s.getCurrentFen());

	logStep('Apply legal moves: e2e4, e7e5, g1f3');
	let r1 = s.applyMoveUci({ from: 'e2', to: 'e4' });
	assert(r1.ok, 'e2e4 should be legal');
	assertEqual(s.getCurrentPly(), 1, 'ply should be 1 after e2e4');

	let r2 = s.applyMoveUci({ from: 'e7', to: 'e5' });
	assert(r2.ok, 'e7e5 should be legal');
	assertEqual(s.getCurrentPly(), 2, 'ply should be 2 after e7e5');

	let r3 = s.applyMoveUci({ from: 'g1', to: 'f3' });
	assert(r3.ok, 'g1f3 should be legal');
	assertEqual(s.getCurrentPly(), 3, 'ply should be 3 after g1f3');

	const moves = s.getActiveLineMoves();
	assertEqual(moves.length, 3, 'active line should have 3 moves');
	assertEqual(moves[0]?.uci, 'e2e4', 'move 1 uci should be e2e4');
	assertEqual(moves[1]?.uci, 'e7e5', 'move 2 uci should be e7e5');
	assertEqual(moves[2]?.uci, 'g1f3', 'move 3 uci should be g1f3');

	console.log('Active line moves:', moves.map((m) => `${m.uci} (${m.san})`).join(', '));

	logStep('Navigation: goPrev/goNext/goStart/goEnd/goToPly');
	s.goPrev();
	assertEqual(s.getCurrentPly(), 2, 'goPrev should move back to ply 2');

	s.goNext();
	assertEqual(s.getCurrentPly(), 3, 'goNext should move forward to ply 3');

	s.goStart();
	assertEqual(s.getCurrentPly(), 0, 'goStart should move to ply 0');

	s.goEnd();
	assertEqual(s.getCurrentPly(), 3, 'goEnd should move to last ply on active line');

	s.goToPly(1);
	assertEqual(s.getCurrentPly(), 1, 'goToPly(1) should go to ply 1');

	logStep('Illegal move attempt');
	const illegal = expectFailure(
		s.applyMoveUci({ from: 'e2', to: 'e5' }),
		'ILLEGAL_MOVE',
		'Illegal move',
	);
	assertFailure(illegal, 'illegal move should return ok=false');
	assertEqual(illegal.error.code, 'ILLEGAL_MOVE', 'illegal move should return ILLEGAL_MOVE');
	console.log('Illegal move error:', illegal.error);

	logStep('Variation creation (same parent, different move)');
	// We are at ply 1 position after e2e4.
	// Let's try a different legal black reply than e7e5 to create a variation.
	const var1 = s.applyMoveUci({ from: 'c7', to: 'c5' });
	assert(var1.ok, 'c7c5 should be legal');
	assertEqual(s.getCurrentPly(), 2, 'ply should be 2 after black reply');

	// Now parent at ply 1 should have 2 children (e7e5 and c7c5) if both were created.
	// To check it, goPrev to parent then inspect child count.
	s.goPrev(); // back to ply 1
	const parent = s.getCurrentNode();
	assertEqual(parent.ply, 1, 'we should be at ply 1');
	assert(parent.childIds.length >= 2, 'parent should have at least 2 continuations now');
	console.log('Parent children count:', parent.childIds.length);
	console.log('Active child is:', parent.activeChildId);

	/************************************************************* */
	/************************************************************* */
	/************************************************************* */
	/************************************************************* */

	// Promotion test availabl for the v0.2
	logStep('Promotion required behavior (real)');

	// White pawn on a7 ready to promote to a8. White to move.
	const promoFen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
	const fenLoad = s.loadFenForCase1(promoFen);
	assert(fenLoad.ok, 'loadFenForCase1 should succeed');

	// Attempt promotion without specifying a piece => must fail with PROMOTION_REQUIRED.
	const promoMissing = expectFailure(
		s.applyMoveUci({ from: 'a7', to: 'a8' }),
		'PROMOTION_REQUIRED',
		'Promotion without piece',
	);
	assertFailure(promoMissing, 'promotion without piece should fail');
	assertEqual(
		promoMissing.error.code,
		'PROMOTION_REQUIRED',
		'promotion without piece should return PROMOTION_REQUIRED',
	);

	// Now promote to queen.
	const promoOk = s.applyMoveUci({ from: 'a7', to: 'a8', promotion: 'q' });
	assert(promoOk.ok, 'promotion with piece should succeed');
	assertEqual(s.getCurrentPly(), 1, 'ply should be 1 after promotion');
	console.log('Promotion result:', promoOk.ok ? promoOk.uci : promoOk.error);

	/************************************************************* */
	/************************************************************* */
	/************************************************************* */
	/************************************************************* */

	logStep('Load PGN (CASE2_PGN)');

	// Ensure we are back to a clean CASE1 session before loading PGN.
	s.loadInitial();

	const pgn = `
[Event "Harness Test"]
[Site "?"]
[Date "2026.01.14"]
[Round "-"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *
`.trim();

	const pgnLoad = s.loadPgn(pgn, { name: 'Harness PGN' });
	assert(pgnLoad.ok, 'loadPgn should succeed from CASE1_FREE');

	assertEqual(s.getMode(), 'CASE2_PGN', 'mode should be CASE2_PGN after loadPgn');
	assertEqual(s.getSource().kind, 'PGN', 'source.kind should be PGN after loadPgn');
	assertEqual(s.getCurrentPly(), 4, 'ply should be 4 after loading 4 plies');

	console.log(
		'Loaded PGN moves:',
		s
			.getActiveLineMoves()
			.map((m) => `${m.san}`)
			.join(' '),
	);

	logStep('Load PGN forbidden when already in CASE2');

	const pgnLoad2 = s.loadPgn(pgn, { name: 'Second PGN' });
	assertResultFailure(pgnLoad2, 'loadPgn should fail when already in CASE2');
	assertEqual(
		pgnLoad2.error.code,
		'RESET_REQUIRED',
		'Second loadPgn should return RESET_REQUIRED when already in CASE2',
	);

	console.log('Second PGN load error (expected):', pgnLoad2.error);

	/************************************************************* */
	/************************************************************* */
	/************************************************************* */
	/************************************************************* */

	logStep('Load DB game moves (CASE2_DB)');

	s.loadInitial();

	const dbLoad = s.loadGameMovesSan(['e4', 'e5', 'Nf3', 'Nc6'], { gameId: 'game_123' });
	assert(dbLoad.ok, 'loadGameMovesSan should succeed from CASE1');

	assertEqual(s.getMode(), 'CASE2_DB', 'mode should be CASE2_DB after DB load');
	assertEqual(s.getSource().kind, 'DB', 'source.kind should be DB after DB load');
	assertEqual(s.getCurrentPly(), 4, 'ply should be 4 after DB load');

	console.log(
		'Loaded DB moves:',
		s
			.getActiveLineMoves()
			.map((m) => m.san)
			.join(' '),
	);

	logStep('Load PGN forbidden when CASE2_DB is active');

	const pgnForbidden = s.loadPgn(`1. e4 e5 2. Nf3 Nc6 *`, { name: 'Should Fail' });
	assert(!pgnForbidden.ok, 'loadPgn should fail when CASE2_DB is active');
	if (!pgnForbidden.ok) {
		assertEqual(
			pgnForbidden.error.code,
			'RESET_REQUIRED',
			'should return RESET_REQUIRED in CASE2_DB',
		);
		console.log('PGN load while DB active (expected):', pgnForbidden.error);
	}

	console.log('\n✅ V0.2.x harness completed successfully.');
}

main();
