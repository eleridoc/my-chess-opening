import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client'; // 👈 nouveau
import { coreIsReady } from 'my-chess-opening-core';

const prisma = new PrismaClient(); // 👈 instance globale

let mainWindow: BrowserWindow | null = null;

async function getSetupState() {
	const accountsCount = await prisma.externalAccount.count();
	const config = await prisma.appConfig.findUnique({ where: { id: 1 } });

	return {
		hasAccounts: accountsCount > 0,
		hasCompletedSetup: config?.hasCompletedSetup ?? false,
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
		// on s'assure d'avoir une AppConfig (id = 1)
		const config = await tx.appConfig.upsert({
			where: { id: 1 },
			update: { hasCompletedSetup: true },
			create: { hasCompletedSetup: true },
		});

		// stratégie simple pour le setup : on supprime les anciens comptes et on recrée
		await tx.externalAccount.deleteMany({});

		if (lichess) {
			await tx.externalAccount.create({
				data: {
					site: 'LICHESS',
					username: lichess,
					config: { connect: { id: config.id } },
				},
			});
		}

		if (chesscom) {
			await tx.externalAccount.create({
				data: {
					site: 'CHESSCOM',
					username: chesscom,
					config: { connect: { id: config.id } },
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

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	// déjà existant
	ipcMain.handle('ping', async () => {
		return {
			message: 'pong from main',
			core: coreIsReady(),
		};
	});

	// 👇 nouveau : état du setup
	ipcMain.handle('setup:getState', async () => {
		return getSetupState();
	});

	// 👇 nouveau : enregistrement des comptes
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
