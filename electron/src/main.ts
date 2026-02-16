import { app, BrowserWindow, ipcMain, session, shell, screen } from 'electron';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { coreIsReady } from 'my-chess-opening-core';

import { cleanupAbortedImportRuns } from './import/importAllAccounts';
import { registerAccountsIpc } from './accounts/accountsIpc';
import { registerLogsIpc } from './logs/logsIpc';
import { registerExplorerIpc } from './explorer/explorerIpc';
import { registerGamesIpc } from './games/gamesIpc';
import { registerSystemIpc } from './system/systemIpc';
import { registerImportIpc } from './import/importIpc';

import type { ImportEvent } from 'my-chess-opening-core';

app.setName('My Chess Opening');
app.setAppUserModelId('com.eleridoc.my-chess-opening');

/**
 * Prisma client used by the main process.
 *
 * Notes:
 * - Keep a single instance for the whole process lifetime.
 * - Do not create per-request clients in IPC handlers.
 */
const prisma = new PrismaClient();

/**
 * Main BrowserWindow reference (single-window app for now).
 * Used to push best-effort import events to the renderer.
 */
let mainWindow: BrowserWindow | null = null;

const IMPORT_EVENT_CHANNEL = 'import:event';

/**
 * Emit an import event to the renderer (if available).
 *
 * Best-effort behavior:
 * - If the window is not ready/available, events are dropped.
 * - Emission failures must never crash the main process.
 */
function emitImportEvent(event: ImportEvent): void {
	if (!mainWindow) return;

	try {
		mainWindow.webContents.send(IMPORT_EVENT_CHANNEL, event);
	} catch (err) {
		// Keep it silent in prod; in dev it's still useful to know.
		console.warn('[IPC] Failed to emit import event', err);
	}
}

/**
 * Dev server URL (Angular).
 * Keep it configurable so you can run on another port without touching code.
 */
const DEV_SERVER_URL = process.env['MCO_DEV_SERVER_URL'] ?? 'http://localhost:4200';

/**
 * Resolve the assets directory for the app icon and other resources.
 *
 * - In dev, __dirname points to compiled output (usually electron/dist).
 * - In packaged apps, resources are located under process.resourcesPath.
 */
function getAssetsDir(): string {
	return app.isPackaged
		? path.join(process.resourcesPath, 'assets')
		: path.join(__dirname, '../assets');
}

/**
 * OS-specific application icon.
 * Electron expects different formats on Windows/macOS/Linux.
 */
function getIconPath(): string {
	const assetsDir = getAssetsDir();

	if (process.platform === 'win32') return path.join(assetsDir, 'icon.ico');
	if (process.platform === 'darwin') return path.join(assetsDir, 'icon.icns');

	return path.join(assetsDir, 'icon.png'); // linux
}

/**
 * Minimal "setup state" query.
 *
 * The UI uses it to know whether at least one account exists (onboarding gating).
 */
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
 * Notes:
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

/**
 * Default restored size (when the window is not maximized).
 * We optimize for laptop/desktop usage, and maximize on launch.
 */
const DEFAULT_RESTORED_WINDOW = { width: 1280, height: 720 };

/**
 * Minimal supported window size.
 * Keep <= 1280×720 so the app remains usable on smaller displays.
 */
const MIN_WINDOW = { width: 1280, height: 720 };

function getInitialWindowBounds(): {
	width: number;
	height: number;
	minWidth: number;
	minHeight: number;
} {
	// Use the display where the cursor currently is (better for multi-monitor setups).
	const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	const workArea = display.workAreaSize;

	// Clamp default size to the available work area to avoid off-screen windows.
	const width = Math.min(DEFAULT_RESTORED_WINDOW.width, workArea.width);
	const height = Math.min(DEFAULT_RESTORED_WINDOW.height, workArea.height);

	// Also clamp min size to the work area to avoid impossible constraints.
	const minWidth = Math.min(MIN_WINDOW.width, workArea.width);
	const minHeight = Math.min(MIN_WINDOW.height, workArea.height);

	return { width, height, minWidth, minHeight };
}

function createWindow(): void {
	const { width, height, minWidth, minHeight } = getInitialWindowBounds();

	mainWindow = new BrowserWindow({
		// Default "restored" bounds (used when the user restores down from maximized).
		width,
		height,
		minWidth,
		minHeight,

		// Hide until ready to prevent a visible resize flash before maximizing.
		show: false,

		title: 'My Chess Opening',
		icon: getIconPath(),
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	/**
	 * Open maximized (not fullscreen).
	 * Maximized respects the OS work area and keeps the restored bounds above.
	 */
	mainWindow.once('ready-to-show', () => {
		mainWindow?.maximize();
		mainWindow?.show();
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

	// DEV only (current setup).
	// In production, you will likely load a local file (Angular build output).
	mainWindow.loadURL(DEV_SERVER_URL);

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(async () => {
	// Register CSP before creating any BrowserWindow.
	registerContentSecurityPolicy();

	/**
	 * Minimal health-check used to validate IPC wiring from the renderer.
	 *
	 * "core" is the version string from the shared core package.
	 */
	ipcMain.handle('ping', async () => {
		return {
			message: 'pong from main',
			core: coreIsReady(),
		};
	});

	/**
	 * Domain IPC registrations.
	 * Keep handlers in dedicated modules to avoid growing `main.ts`.
	 */
	registerAccountsIpc();
	registerLogsIpc();
	registerExplorerIpc();
	registerGamesIpc();
	registerSystemIpc();
	registerImportIpc({ emitImportEvent });

	createWindow();

	// Ensure DB is reachable once (creates a first Prisma round-trip).
	try {
		await getSetupState();
	} catch (err) {
		console.error('[DB] Initial DB health-check failed', err);
	}

	// Cleanup any "running" import runs left unfinished from a previous session.
	// This ensures the DB doesn't keep stale "RUNNING" markers if the app crashed/closed mid-import.
	try {
		const cleaned = await cleanupAbortedImportRuns();
		if (cleaned > 0) {
			console.log('[IMPORT] Cleaned up aborted import runs:', cleaned);
		}
	} catch (err) {
		console.error('[IMPORT] Failed to cleanup aborted import runs', err);
	}

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
