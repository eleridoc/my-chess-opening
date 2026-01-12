import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { PrismaClient, Prisma, ExternalSite } from '@prisma/client';
import { coreIsReady } from 'my-chess-opening-core';
import { testImportSinceYesterday, testImportAllAccountsMax5 } from './dev/testImport';

const prisma = new PrismaClient();

let mainWindow: BrowserWindow | null = null;

async function getSetupState() {
	const accountsCount = await prisma.accountConfig.count();

	return {
		hasAccounts: accountsCount > 0,
		hasCompletedSetup: accountsCount > 0,
	};
}

type SaveAccountsInput = {
	lichessUsername?: string | null;
	chesscomUsername?: string | null;
};

async function saveAccounts(input: SaveAccountsInput) {
	const lichess = input.lichessUsername?.trim() || null;
	const chesscom = input.chesscomUsername?.trim() || null;

	if (!lichess && !chesscom) {
		throw new Error('At least one account (Lichess or Chess.com) is required');
	}

	await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		// Initial setup strategy (2 fields):
		// - Replace the single configured account for each site.
		// Later, when you support multiple accounts per site, you'll switch to add/remove by id.

		// Lichess
		await tx.accountConfig.deleteMany({ where: { site: ExternalSite.LICHESS } });
		if (lichess) {
			await tx.accountConfig.create({
				data: {
					site: ExternalSite.LICHESS,
					username: lichess,
				},
			});
		}

		// Chess.com
		await tx.accountConfig.deleteMany({ where: { site: ExternalSite.CHESSCOM } });
		if (chesscom) {
			await tx.accountConfig.create({
				data: {
					site: ExternalSite.CHESSCOM,
					username: chesscom,
				},
			});
		}
	});
}

function createWindow() {
	console.log(coreIsReady());

	mainWindow = new BrowserWindow({
		width: 1000,
		height: 700,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	mainWindow.loadURL('http://localhost:4200');

	// console.error('[TEST IMPORT] start');
	// testImportSinceYesterday().catch((e) => {
	// 	console.error('[TEST IMPORT] failed', e);
	// });

	// (async () => {
	// 	await testImportAllAccountsMax5();
	// 	process.exit(0);
	// })().catch((e) => {
	// 	console.error(e);
	// 	process.exit(1);
	// });

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	ipcMain.handle('ping', async () => {
		return {
			message: 'pong from main',
			core: coreIsReady(),
		};
	});

	ipcMain.handle('setup:getState', async () => {
		return getSetupState();
	});

	ipcMain.handle('setup:saveAccounts', async (_event, input: SaveAccountsInput) => {
		await saveAccounts(input);
		return { ok: true };
	});

	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
