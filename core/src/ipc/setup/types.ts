export interface SetupState {
	hasAccounts: boolean;
	hasCompletedSetup: boolean;
}

export interface SaveAccountsInput {
	lichessUsername?: string | null;
	chesscomUsername?: string | null;
}

export interface SetupApi {
	getState: () => Promise<SetupState>;
	saveAccounts: (input: SaveAccountsInput) => Promise<{ ok: true }>;
}
