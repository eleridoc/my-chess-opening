import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import * as path from 'node:path';
import { PrismaClient, ExternalSite } from '@prisma/client';
import { coreIsReady } from 'my-chess-opening-core';

import { importAllAccounts } from './import/importAllAccounts';
import { registerAccountsIpc } from './accounts/accountsIpc';
import { registerLogsIpc } from './logs/logsIpc';
import { registerExplorerIpc } from './explorer/explorerIpc';
import { registerGamesIpc } from './games/gamesIpc';
import { registerSystemIpc } from './system/systemIpc';

/**
 * In-app guard to prevent concurrent imports from being triggered via IPC.
 * This is intentionally kept in-memory (not persisted).
 */
let isImportRunning = false;

app.setName('My Chess Opening');
app.setAppUserModelId('com.eleridoc.my-chess-opening');

/**
 * Prisma client used by the main process.
 * Keep a single instance for the whole process lifetime.
 */
const prisma = new PrismaClient();

let mainWindow: BrowserWindow | null = null;

/**
 * Dev server URL (Angular).
 * Keep it configurable so you can run on another port without touching code.
 */
const DEV_SERVER_URL = process.env['MCO_DEV_SERVER_URL'] ?? 'http://localhost:4200';

function getAssetsDir(): string {
	// In dev, __dirname points to compiled output (usually electron/dist).
	// In packaged apps, use process.resourcesPath.
	return app.isPackaged
		? path.join(process.resourcesPath, 'assets')
		: path.join(__dirname, '../assets');
}

function getIconPath(): string {
	const assetsDir = getAssetsDir();

	if (process.platform === 'win32') {
		return path.join(assetsDir, 'icon.ico');
	}

	if (process.platform === 'darwin') {
		return path.join(assetsDir, 'icon.icns');
	}

	return path.join(assetsDir, 'icon.png'); // linux
}

async function getSetupState(): Promise<{ hasAccounts: boolean; hasCompletedSetup: boolean }> {
	const accountsCount = await prisma.accountConfig.count();

	return {
		hasAccounts: accountsCount > 0,
		// Current "setup" is considered complete when at least one account exists.
		// (This may evolve when we introduce a richer onboarding flow.)
		hasCompletedSetup: accountsCount > 0,
	};
}

/**
 * Registers a Content Security Policy (CSP) for the renderer.
 *
 * Why:
 * - Electron warns if the renderer has no CSP or uses "unsafe-eval".
 * - In production, CSP should be strict.
 * - In development, CSP must allow the Angular dev server + websocket (live reload).
 *
 * Note:
 * - CSP is injected via response headers. It works even when loading http://localhost:4200.
 * - Google Fonts are handled explicitly (style-src-elem + font-src).
 */
function registerContentSecurityPolicy(): void {
	const isDev = !app.isPackaged;

	// Toggle if your Angular dev setup really requires eval().
	// Keeping this OFF removes Electron's "unsafe-eval" warning.
	const allowUnsafeEvalInDev = false;

	// If you keep Google Fonts links in production builds, keep this ON.
	// If you self-host fonts/icons, turn it OFF for a stricter CSP.
	const allowGoogleFontsInProd = true;

	let devOrigin = 'http://localhost:4200';
	let devWsOrigin = 'ws://localhost:4200';

	try {
		const u = new URL(DEV_SERVER_URL);
		devOrigin = u.origin;

		const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
		devWsOrigin = `${wsProtocol}//${u.host}`;
	} catch {
		// Keep defaults if URL parsing fails.
	}

	// Google Fonts origins
	const googleFontsCss = 'https://fonts.googleapis.com';
	const googleFontsFiles = 'https://fonts.gstatic.com';

	const cspDev = [
		`default-src 'self' ${devOrigin}`,

		`script-src 'self' ${devOrigin}${allowUnsafeEvalInDev ? " 'unsafe-eval'" : ''}`,

		// IMPORTANT:
		// - External stylesheets (Google Fonts) are controlled by style-src-elem.
		// - Inline styles in dev often require 'unsafe-inline'.
		`style-src 'self' ${devOrigin} 'unsafe-inline' ${googleFontsCss}`,
		`style-src-elem 'self' ${devOrigin} 'unsafe-inline' ${googleFontsCss}`,

		// Font files are served from fonts.gstatic.com
		`font-src 'self' data: ${devOrigin} ${googleFontsFiles}`,

		`img-src 'self' data: blob: ${devOrigin}`,
		`connect-src 'self' ${devOrigin} ${devWsOrigin}`,

		`object-src 'none'`,
		`base-uri 'self'`,
		`frame-ancestors 'none'`,
	].join('; ');

	const cspProdBase = [
		`default-src 'self'`,
		`script-src 'self'`,
		`style-src 'self' 'unsafe-inline'`,
		`style-src-elem 'self' 'unsafe-inline'`,
		`img-src 'self' data: blob:`,
		`font-src 'self' data:`,
		`connect-src 'self'`,
		`object-src 'none'`,
		`base-uri 'self'`,
		`frame-ancestors 'none'`,
	];

	const cspProdWithGoogleFonts = [
		`default-src 'self'`,
		`script-src 'self'`,
		`style-src 'self' 'unsafe-inline' ${googleFontsCss}`,
		`style-src-elem 'self' 'unsafe-inline' ${googleFontsCss}`,
		`img-src 'self' data: blob:`,
		`font-src 'self' data: ${googleFontsFiles}`,
		`connect-src 'self'`,
		`object-src 'none'`,
		`base-uri 'self'`,
		`frame-ancestors 'none'`,
	];

	const csp = isDev
		? cspDev
		: (allowGoogleFontsInProd ? cspProdWithGoogleFonts : cspProdBase).join('; ');

	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		const responseHeaders = details.responseHeaders ?? {};
		responseHeaders['Content-Security-Policy'] = [csp];
		callback({ responseHeaders });
	});
}

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1000,
		height: 700,
		title: 'My Chess Opening',
		icon: getIconPath(),
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	/**
	 * Security hardening:
	 * - Deny window.open() and open links in the OS browser instead.
	 * This avoids unexpected new BrowserWindows being created by web content.
	 */
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url).catch(() => void 0);
		return { action: 'deny' };
	});

	// DEV only (current setup)
	// In production, you will likely load a local file (Angular build output).
	mainWindow.loadURL(DEV_SERVER_URL);

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	// Register CSP before creating any BrowserWindow.
	registerContentSecurityPolicy();

	/**
	 * Minimal health-check used to validate IPC wiring from the renderer.
	 * "core" is the version string from the shared core package.
	 */
	ipcMain.handle('ping', async () => {
		return {
			message: 'pong from main',
			core: coreIsReady(),
		};
	});

	ipcMain.handle(
		'import:runNow',
		async (
			_event,
			input?: { sinceOverrideIso?: string | null; maxGamesPerAccount?: number | null },
		) => {
			if (isImportRunning) {
				// Idempotent behavior: do not start a second import.
				return { ok: true, message: 'Import already running' };
			}

			isImportRunning = true;

			try {
				const sinceOverride = input?.sinceOverrideIso
					? new Date(input.sinceOverrideIso)
					: null;

				const maxGamesPerAccount =
					typeof input?.maxGamesPerAccount === 'number' ? input.maxGamesPerAccount : null;

				console.log('[IPC] import:runNow start', input);

				await importAllAccounts({
					sinceOverride,
					maxGamesPerAccount,
				});

				console.log('[IPC] import:runNow end');

				return { ok: true, message: 'Import completed' };
			} finally {
				isImportRunning = false;
			}
		},
	);

	// Domain IPC registrations
	registerAccountsIpc();
	registerLogsIpc();
	registerExplorerIpc();
	registerGamesIpc();
	registerSystemIpc();

	createWindow();

	app.on('activate', () => {
		// macOS convention: re-create a window when the dock icon is clicked.
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	// macOS convention: keep app running until the user quits explicitly.
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
