import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import * as readline from 'node:readline';

import type { AnalysisSettings } from 'my-chess-opening-core';

import {
	buildStockfishGoCommand,
	getStockfishEvaluationTimeoutMs,
	normalizeStockfishAnalysisSettings,
	normalizeUciScoreToWhitePerspective,
} from './stockfishEvaluation';
import { resolveStockfishExecutable, STOCKFISH_ENGINE_NAME } from './stockfishEnginePaths';
import {
	extractStockfishVersionFromName,
	parseStockfishBestMoveLine,
	parseStockfishIdNameLine,
	parseStockfishInfoLine,
} from './stockfishUciParser';
import type {
	StockfishEvaluateFenInput,
	StockfishFenEvaluation,
	StockfishInfoLine,
} from './stockfishUciTypes';

interface UciLineWaiter {
	description: string;
	predicate: (line: string) => boolean;
	resolve: (line: string) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}

/**
 * Minimal Stockfish UCI client.
 *
 * Responsibilities:
 * - start the native engine process
 * - initialize UCI mode
 * - apply engine options
 * - evaluate one FEN
 * - parse the latest primary PV score
 *
 * This class intentionally does not know about Prisma or IPC.
 */
export class StockfishUciClient {
	private engineProcess: ChildProcessWithoutNullStreams | null = null;
	private stdoutReader: readline.Interface | null = null;
	private stderrReader: readline.Interface | null = null;
	private waiters: UciLineWaiter[] = [];

	private initialized = false;
	private disposed = false;
	private evaluationInProgress = false;

	private engineName = STOCKFISH_ENGINE_NAME;
	private engineVersion: string | null = null;
	private latestPrimaryInfo: StockfishInfoLine | null = null;

	constructor(private readonly customExecutablePath: string | null = null) {}

	getDetectedEngineName(): string {
		return this.engineName;
	}

	getDetectedEngineVersion(): string | null {
		return this.engineVersion;
	}

	async start(): Promise<void> {
		this.assertNotDisposed();

		if (this.engineProcess) {
			return;
		}

		const executablePath = this.resolveExecutablePath();

		const child = spawn(executablePath, [], {
			stdio: 'pipe',
			windowsHide: true,
		}) as ChildProcessWithoutNullStreams;

		this.engineProcess = child;

		this.stdoutReader = readline.createInterface({
			input: child.stdout,
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		this.stderrReader = readline.createInterface({
			input: child.stderr,
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		this.stdoutReader.on('line', (line) => this.handleStdoutLine(line));
		this.stderrReader.on('line', (line) => this.handleStderrLine(line));

		child.once('error', (error) => {
			this.rejectAllWaiters(error instanceof Error ? error : new Error(String(error)));
			this.clearProcessReferences();
		});

		child.once('exit', (code, signal) => {
			const reason = signal
				? `Stockfish process exited with signal ${signal}.`
				: `Stockfish process exited with code ${code ?? 'unknown'}.`;

			this.rejectAllWaiters(new Error(reason));
			this.clearProcessReferences();
		});
	}

	async initialize(): Promise<void> {
		this.assertNotDisposed();

		if (this.initialized) {
			return;
		}

		await this.start();

		this.sendCommand('uci');

		await this.waitForLine((line) => line === 'uciok', 10_000, 'Stockfish UCI initialization');

		this.initialized = true;

		await this.waitUntilReady();
	}

	async applySettings(settings: AnalysisSettings): Promise<AnalysisSettings> {
		this.assertNotDisposed();

		await this.initialize();

		const normalizedSettings = normalizeStockfishAnalysisSettings(settings);

		this.sendCommand(`setoption name Threads value ${normalizedSettings.threads}`);
		this.sendCommand(`setoption name Hash value ${normalizedSettings.hashMb}`);
		this.sendCommand(`setoption name MultiPV value ${normalizedSettings.multiPv}`);

		await this.waitUntilReady();

		return normalizedSettings;
	}

	async newGame(): Promise<void> {
		this.assertNotDisposed();

		await this.initialize();

		this.sendCommand('ucinewgame');
		await this.waitUntilReady();
	}

	async evaluateFen(input: StockfishEvaluateFenInput): Promise<StockfishFenEvaluation> {
		this.assertNotDisposed();

		if (this.evaluationInProgress) {
			throw new Error('Stockfish is already evaluating a position.');
		}

		this.evaluationInProgress = true;

		try {
			const normalizedSettings = await this.applySettings(input.settings);
			const timeoutMs =
				input.timeoutMs ?? getStockfishEvaluationTimeoutMs(normalizedSettings);

			this.latestPrimaryInfo = null;

			const startedAt = performance.now();

			this.sendCommand(`position fen ${input.fen}`);
			this.sendCommand(buildStockfishGoCommand(normalizedSettings));

			const rawBestMoveLine = await this.waitForLine(
				(line) => line.startsWith('bestmove '),
				timeoutMs,
				'Stockfish bestmove',
			);

			const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
			const bestMoveLine = parseStockfishBestMoveLine(rawBestMoveLine);

			const latestPrimaryInfo = this.getLatestPrimaryInfo();
			const latestScore = latestPrimaryInfo?.score ?? null;
			const evaluation = latestScore
				? normalizeUciScoreToWhitePerspective(latestScore, input.fen)
				: null;

			return {
				fen: input.fen,
				engineName: this.engineName,
				engineVersion: this.engineVersion,
				bestMoveUci: bestMoveLine?.bestMoveUci ?? null,
				evaluation,
				depthReached: latestPrimaryInfo?.depth ?? null,
				principalVariationUci: latestPrimaryInfo?.principalVariationUci ?? [],
				timeMs: elapsedMs,
				rawBestMoveLine,
			};
		} finally {
			this.evaluationInProgress = false;
		}
	}

	/**
	 * Stop the current search.
	 *
	 * The engine normally answers with a `bestmove` line after `stop`.
	 * This method is intentionally best-effort because cancellation will be
	 * coordinated by the higher-level analysis service later.
	 */
	async stop(): Promise<void> {
		if (!this.engineProcess || this.engineProcess.killed) {
			return;
		}

		try {
			this.sendCommand('stop');

			await this.waitForLine((line) => line.startsWith('bestmove '), 5_000, 'Stockfish stop');
		} catch {
			// Best-effort stop. The caller may still dispose the process.
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		try {
			if (this.engineProcess && !this.engineProcess.killed) {
				this.sendCommand('quit');
			}
		} catch {
			// Ignore shutdown errors.
		}

		try {
			this.stdoutReader?.close();
		} catch {
			// Ignore shutdown errors.
		}

		try {
			this.stderrReader?.close();
		} catch {
			// Ignore shutdown errors.
		}

		if (this.engineProcess && !this.engineProcess.killed) {
			this.engineProcess.kill();
		}

		this.rejectAllWaiters(new Error('Stockfish client was disposed.'));
		this.clearProcessReferences();
	}

	private getLatestPrimaryInfo(): StockfishInfoLine | null {
		return this.latestPrimaryInfo;
	}

	private resolveExecutablePath(): string {
		if (this.customExecutablePath) {
			return this.customExecutablePath;
		}

		const resolution = resolveStockfishExecutable();

		if (!resolution.available || !resolution.executablePath) {
			throw new Error(resolution.reason ?? 'Stockfish executable is not available.');
		}

		return resolution.executablePath;
	}

	private waitUntilReady(): Promise<string> {
		this.sendCommand('isready');

		return this.waitForLine((line) => line === 'readyok', 10_000, 'Stockfish readiness');
	}

	private sendCommand(command: string): void {
		const child = this.engineProcess;

		if (!child || child.killed || !child.stdin.writable) {
			throw new Error('Stockfish process is not writable.');
		}

		child.stdin.write(`${command}\n`);
	}

	private waitForLine(
		predicate: (line: string) => boolean,
		timeoutMs: number,
		description: string,
	): Promise<string> {
		this.assertNotDisposed();

		return new Promise<string>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.waiters = this.waiters.filter((waiter) => waiter !== waiterRef);
				reject(new Error(`${description} timed out after ${timeoutMs}ms.`));
			}, timeoutMs);

			const waiterRef: UciLineWaiter = {
				description,
				predicate,
				resolve: (line) => {
					clearTimeout(timeout);
					resolve(line);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
				timeout,
			};

			this.waiters.push(waiterRef);
		});
	}

	private handleStdoutLine(line: string): void {
		const trimmedLine = line.trim();

		if (!trimmedLine) {
			return;
		}

		const detectedEngineName = parseStockfishIdNameLine(trimmedLine);

		if (detectedEngineName) {
			this.engineName = detectedEngineName;
			this.engineVersion = extractStockfishVersionFromName(detectedEngineName);
		}

		const infoLine = parseStockfishInfoLine(trimmedLine);

		if (infoLine?.score) {
			// Keep only the primary line. MultiPV 1 can be explicit or omitted.
			if (infoLine.multiPv === null || infoLine.multiPv === 1) {
				this.latestPrimaryInfo = infoLine;
			}
		}

		this.resolveMatchingWaiters(trimmedLine);
	}

	private handleStderrLine(line: string): void {
		const trimmedLine = line.trim();

		if (!trimmedLine) {
			return;
		}

		console.warn('[Stockfish]', trimmedLine);
	}

	private resolveMatchingWaiters(line: string): void {
		const matchedWaiters = this.waiters.filter((waiter) => waiter.predicate(line));

		if (matchedWaiters.length === 0) {
			return;
		}

		this.waiters = this.waiters.filter((waiter) => !matchedWaiters.includes(waiter));

		for (const waiter of matchedWaiters) {
			waiter.resolve(line);
		}
	}

	private rejectAllWaiters(error: Error): void {
		const waiters = this.waiters;
		this.waiters = [];

		for (const waiter of waiters) {
			clearTimeout(waiter.timeout);
			waiter.reject(error);
		}
	}

	private clearProcessReferences(): void {
		this.engineProcess = null;
		this.stdoutReader = null;
		this.stderrReader = null;
		this.initialized = false;
		this.evaluationInProgress = false;
		this.latestPrimaryInfo = null;
	}

	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error('Stockfish client is already disposed.');
		}
	}
}
