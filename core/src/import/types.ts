export enum ExternalSite {
	CHESSCOM = 'CHESSCOM',
	LICHESS = 'LICHESS',
}

export type GameSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical';
export type PlayerColor = 'white' | 'black';

export type ImportOptions = {
	username: string;
	since?: Date | null; // null/undefined => full import
	ratedOnly?: boolean; // default true
	speeds?: GameSpeed[]; // default ["bullet","blitz","rapid"]
	includeMoves?: boolean; // default true
};

export type ImportedGamePlayer = {
	color: PlayerColor;
	username: string;
	elo?: number;
	ratingDiff?: number;
};

export type ImportedGameMove = {
	ply: number; // 1,2,3... half-moves
	san: string; // SAN token
	clockMs?: number; // remaining clock after the move
};

export type ImportedGameRaw = {
	site: ExternalSite;
	externalId: string;
	siteUrl?: string;

	playedAt: Date; // UTC
	rated: boolean;
	variant: string; // e.g. "Standard"
	speed: GameSpeed; // bullet/blitz/rapid/classical
	timeControl: string; // "900+10"
	initialSeconds: number;
	incrementSeconds: number;

	result: string; // "1-0" / "0-1" / "1/2-1/2"
	termination?: string;
	eco?: string;
	opening?: string;

	pgn: string;
	players: [ImportedGamePlayer, ImportedGamePlayer]; // [white, black]
	moves?: ImportedGameMove[];
};
