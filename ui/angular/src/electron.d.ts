import type { ElectronApi } from 'my-chess-opening-core';
declare global {
	interface Window {
		electron?: ElectronApi;
	}
}

export {};
