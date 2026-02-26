import { app } from 'electron';
import * as path from 'node:path';

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
