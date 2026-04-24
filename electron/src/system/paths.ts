import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type AppRuntimeMode = 'development' | 'production';

const DEFAULT_DEV_RUNTIME_DIR_NAME = '.runtime';
const DATABASE_DIR_NAME = 'data';
const DATABASE_FILE_NAME = 'my-chess-opening.sqlite';

/**
 * Return the current Electron runtime mode.
 *
 * Notes:
 * - Packaged app means real production distribution.
 * - Local production preview still runs as development from Electron's point of view.
 */
export function getRuntimeMode(): AppRuntimeMode {
	return app.isPackaged ? 'production' : 'development';
}

export function isProductionRuntime(): boolean {
	return getRuntimeMode() === 'production';
}

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
 * Resolve an optional absolute/relative path from an environment variable.
 */
function getEnvPath(name: string): string | null {
	const rawValue = process.env[name]?.trim();

	if (!rawValue) {
		return null;
	}

	return path.resolve(rawValue);
}

/**
 * Root directory used only in development for Electron runtime data.
 *
 * Why:
 * - Avoid mixing dev data with future installed production data.
 * - Keep local preview runs reproducible and easy to reset.
 */
export function getDevelopmentRuntimeDir(): string {
	return (
		getEnvPath('MCO_DEV_RUNTIME_DIR') ??
		path.join(getProjectRoot(), DEFAULT_DEV_RUNTIME_DIR_NAME)
	);
}

export function getDevelopmentUserDataDir(): string {
	return (
		getEnvPath('MCO_DEV_USER_DATA_DIR') ?? path.join(getDevelopmentRuntimeDir(), 'user-data')
	);
}

export function getDevelopmentLogsDir(): string {
	return getEnvPath('MCO_DEV_LOGS_DIR') ?? path.join(getDevelopmentRuntimeDir(), 'logs');
}

/**
 * Configure Electron runtime paths.
 *
 * This must run before `app.whenReady()` so Chromium storage, localStorage,
 * cache and logs are placed in the expected folders.
 */
export function configureRuntimePaths(): void {
	if (!app.isPackaged) {
		const devUserDataDir = getDevelopmentUserDataDir();
		const devLogsDir = getDevelopmentLogsDir();

		fs.mkdirSync(devUserDataDir, { recursive: true });
		fs.mkdirSync(devLogsDir, { recursive: true });

		app.setPath('userData', devUserDataDir);
		app.setAppLogsPath(devLogsDir);
		return;
	}

	// In packaged mode, use Electron's platform-specific logs directory.
	app.setAppLogsPath();
}

export function getUserDataDir(): string {
	return app.getPath('userData');
}

export function getLogsDir(): string {
	return app.getPath('logs');
}

/**
 * Directory reserved for local persistent app data.
 *
 * Do not use a folder named `databases` here. Keep this application-owned.
 */
export function getDatabaseDir(): string {
	return path.join(getUserDataDir(), DATABASE_DIR_NAME);
}

/**
 * Future production SQLite database path.
 *
 * V1.11.1 only centralizes the path. Prisma will be wired to this path in V1.11.2.
 */
export function getDatabaseFilePath(): string {
	return path.join(getDatabaseDir(), DATABASE_FILE_NAME);
}

/**
 * Resolve the Prisma schema path for tooling/runtime operations.
 *
 * This prepares the V1.11.2 work where Prisma initialization will become
 * production-aware.
 */
export function getPrismaSchemaPath(): string {
	return app.isPackaged
		? path.join(process.resourcesPath, 'prisma/schema.prisma')
		: path.join(getProjectRoot(), 'electron/prisma/schema.prisma');
}

export function getPrismaMigrationsDir(): string {
	return app.isPackaged
		? path.join(process.resourcesPath, 'prisma/migrations')
		: path.join(getProjectRoot(), 'electron/prisma/migrations');
}

/**
 * Ensure runtime directories exist before any feature tries to write into them.
 */
export function ensureRuntimeDirectories(): void {
	fs.mkdirSync(getUserDataDir(), { recursive: true });
	fs.mkdirSync(getLogsDir(), { recursive: true });
	fs.mkdirSync(getDatabaseDir(), { recursive: true });
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

export interface RuntimePathsSnapshot {
	runtimeMode: AppRuntimeMode;
	projectRoot: string | null;
	userDataDir: string;
	logsDir: string;
	databaseDir: string;
	databaseFilePath: string;
	assetsDir: string;
	rendererDistDir: string;
	prismaSchemaPath: string;
	prismaMigrationsDir: string;
}

/**
 * Return a diagnostic snapshot of important runtime paths.
 *
 * Keep this in the main process only. It is useful for startup diagnostics
 * and future release smoke tests.
 */
export function getRuntimePathsSnapshot(): RuntimePathsSnapshot {
	return {
		runtimeMode: getRuntimeMode(),
		projectRoot: app.isPackaged ? null : getProjectRoot(),
		userDataDir: getUserDataDir(),
		logsDir: getLogsDir(),
		databaseDir: getDatabaseDir(),
		databaseFilePath: getDatabaseFilePath(),
		assetsDir: getAssetsDir(),
		rendererDistDir: getRendererDistDir(),
		prismaSchemaPath: getPrismaSchemaPath(),
		prismaMigrationsDir: getPrismaMigrationsDir(),
	};
}
