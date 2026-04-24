import { app, net, protocol } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getRendererDistDir } from './paths';

const RENDERER_SCHEME = 'mco';
const RENDERER_HOST = 'renderer';
const LOCAL_RENDERER_URL = `${RENDERER_SCHEME}://${RENDERER_HOST}/index.html`;

/**
 * Register the custom renderer protocol as a secure standard scheme.
 *
 * This must run before `app.whenReady()`.
 */
export function registerRendererProtocolScheme(): void {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: RENDERER_SCHEME,
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				corsEnabled: true,
			},
		},
	]);
}

/**
 * Use the local Angular build when the app is packaged or when explicitly requested.
 */
export function shouldUseLocalRenderer(): boolean {
	return app.isPackaged || process.env['MCO_RENDERER_MODE'] === 'local';
}

export function getLocalRendererUrl(): string {
	return LOCAL_RENDERER_URL;
}

export function isLocalRendererUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === `${RENDERER_SCHEME}:` && parsed.hostname === RENDERER_HOST;
	} catch {
		return false;
	}
}

/**
 * Fail early when trying to use the local renderer without a production Angular build.
 */
export function assertLocalRendererBuildExists(): void {
	const indexPath = path.join(getRendererDistDir(), 'index.html');

	if (!fs.existsSync(indexPath)) {
		throw new Error(
			`[RENDERER] Angular production build not found at "${indexPath}". ` +
				'Run "npm run build:ui:angular:prod" before starting the local renderer.',
		);
	}
}

/**
 * Serve the Angular production build through the custom Electron protocol.
 *
 * Why this exists:
 * - It avoids fragile `file://` loading.
 * - It keeps Angular routing compatible with direct URLs.
 * - It prepares the app for packaged production builds.
 */
export function registerLocalRendererProtocol(): void {
	const rendererRoot = path.resolve(getRendererDistDir());
	const indexPath = path.join(rendererRoot, 'index.html');

	protocol.handle(RENDERER_SCHEME, async (request) => {
		const filePath = resolveRendererFilePath(request.url, rendererRoot, indexPath);

		if (!filePath) {
			return new Response('Not found', { status: 404 });
		}

		return net.fetch(pathToFileURL(filePath).toString());
	});
}

function resolveRendererFilePath(
	requestUrl: string,
	rendererRoot: string,
	indexPath: string,
): string | null {
	let parsed: URL;

	try {
		parsed = new URL(requestUrl);
	} catch {
		return null;
	}

	if (parsed.hostname !== RENDERER_HOST) {
		return null;
	}

	const pathname = decodeURIComponent(parsed.pathname);
	const relativePath =
		pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
	const candidatePath = path.resolve(rendererRoot, relativePath);

	if (!isPathInside(rendererRoot, candidatePath)) {
		return null;
	}

	if (fs.existsSync(candidatePath)) {
		const stat = fs.statSync(candidatePath);

		if (stat.isDirectory()) {
			return indexPath;
		}

		return candidatePath;
	}

	/**
	 * Angular client-side routing fallback.
	 *
	 * Important:
	 * - Only route-like URLs should fallback to index.html.
	 * - Missing assets must return 404 instead of index.html.
	 *   Returning HTML for a missing CSS/JS/image file makes production rendering hard to debug.
	 */
	if (isLikelyAngularRoute(pathname)) {
		return indexPath;
	}

	return null;
}

function isLikelyAngularRoute(pathname: string): boolean {
	if (pathname === '/' || pathname === '') {
		return true;
	}

	const lastSegment = pathname.split('/').pop() ?? '';

	// Asset-like paths usually have a file extension: .js, .css, .png, .svg, .woff2, etc.
	return !lastSegment.includes('.');
}

function isPathInside(parentDir: string, childPath: string): boolean {
	const relative = path.relative(parentDir, childPath);
	return (
		relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
	);
}
