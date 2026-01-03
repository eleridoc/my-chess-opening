import type { ElectronApi } from 'my-chess-opening-shared';

export {};

declare global {
	interface Window {
		electron?: ElectronApi;
	}
}
