export {};

declare global {
	interface SetupState {
		hasAccounts: boolean;
		hasCompletedSetup: boolean;
	}

	interface SaveAccountsInput {
		lichessUsername?: string | null;
		chesscomUsername?: string | null;
	}

	interface SetupApi {
		getState: () => Promise<SetupState>;
		saveAccounts: (input: SaveAccountsInput) => Promise<{ ok: true }>;
	}

	interface ElectronApi {
		ping: () => Promise<{ message: string; core: string }>;
		setup: SetupApi; // 👈 nouveau
	}

	interface Window {
		electron?: ElectronApi;
	}
}
