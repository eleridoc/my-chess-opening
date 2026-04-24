import { app } from 'electron';
import * as path from 'node:path';

/**
 * Resolve the repository root in development.
 *
 * Notes:
 * - This file is compiled to `electron/dist/system/paths.js`.
 * - From there, `../../..` points back to the repository root.
 * - In packaged mode, never rely on this path: use `process.resourcesPath` instead.
 */
export function getProjectRoot(): string {
	return path.resolve(__dirname, '../../..');
}

/**
 * Resolve the absolute path to the app "assets" directory.
 *
 * Notes:
 * - In dev, compiled files live under `electron/dist/**`.
 *   Assets are stored next to `dist` under `electron/assets`.
 * - In packaged apps, assets are shipped under `process.resourcesPath/assets`.
 */
export function getAssetsDir(): string {
	return app.isPackaged
		? path.join(process.resourcesPath, 'assets')
		: path.join(__dirname, '../../assets');
}

/**
 * Resolve the Angular production build directory used by Electron.
 *
 * Development/local preview:
 * - Angular builds to `ui/angular/dist/angular/browser`.
 *
 * Packaged app:
 * - The packaging step will copy the Angular build to `resources/renderer`.
 */
export function getRendererDistDir(): string {
	return app.isPackaged
		? path.join(process.resourcesPath, 'renderer')
		: path.join(getProjectRoot(), 'ui/angular/dist/angular/browser');
}
