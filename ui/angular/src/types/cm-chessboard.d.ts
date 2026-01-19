declare module 'cm-chessboard/src/Chessboard.js' {
	export const COLOR: { white: string; black: string };

	export const INPUT_EVENT_TYPE: {
		moveInputStarted: string;
		validateMoveInput: string;
		moveInputCanceled: string;
		moveInputFinished: string;
		movingOverSquare: string;
	};

	export const MARKER_TYPE: {
		frame: string;
		square: string;
		dot: string;
		circle: string;
	};

	export class Chessboard {
		constructor(context: HTMLElement, props?: any);

		setPosition(fen: string, animated?: boolean): Promise<void>;
		destroy(): void;

		enableMoveInput(eventHandler: (event: any) => boolean | void, color?: any): void;
		disableMoveInput(): void;

		addMarker(type: string, square: string): void;
		removeMarkers(type: string, square?: string): void;

		showPromotionDialog(
			square: string,
			pieceColor: 'w' | 'b',
			callback: (result: { square: string; piece?: string } | null) => void,
		): void;
	}
}

declare module 'cm-chessboard/src/extensions/markers/Markers.js' {
	export class Markers {}
}

declare module 'cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js' {
	export class PromotionDialog {
		constructor(...args: any[]);
	}
}
