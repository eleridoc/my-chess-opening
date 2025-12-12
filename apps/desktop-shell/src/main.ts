import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { coreIsReady } from 'my-chess-opening-core';

let mainWindow: BrowserWindow | null = null;

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

	// En dev : Angular écoute sur 4200
	mainWindow.loadURL('http://localhost:4200');

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	// handler simple pour un ping
	ipcMain.handle('ping', async () => {
		return {
			message: 'pong from main',
			core: coreIsReady(),
		};
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
