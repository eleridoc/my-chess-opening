import { ipcMain, shell } from 'electron';

/**
 * System-level IPC handlers (not tied to a single domain).
 *
 * Currently:
 * - system:openExternal -> open a URL in the user's default browser.
 *
 * Security:
 * - We only allow http/https URLs to avoid opening local files or custom protocols.
 * - Validation happens in the main process (renderer input must be treated as untrusted).
 */

function isAllowedExternalUrl(rawUrl: unknown): rawUrl is string {
	if (typeof rawUrl !== 'string') return false;

	const url = rawUrl.trim();
	if (!url) return false;

	try {
		const u = new URL(url);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

export function registerSystemIpc(): void {
	ipcMain.handle('system:openExternal', async (_event, url: unknown) => {
		if (!isAllowedExternalUrl(url)) {
			throw new Error(`Refused to open external URL: ${String(url)}`);
		}

		await shell.openExternal(url);
		return { ok: true as const };
	});
}
