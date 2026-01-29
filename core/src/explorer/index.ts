/**
 * Explorer module entrypoint (CORE)
 *
 * The Explorer module is responsible for:
 * - Maintaining a chess exploration "session" state (moves, current cursor, variations)
 * - Applying moves and producing derived artifacts (FEN, SAN, UCI...)
 * - Enforcing domain rules (later: mode transitions, reset rules, etc.)
 *
 * UI/Electron MUST NOT implement chess rules or session logic.
 * They should only call the Explorer session API and render the state.
 */

export * from './types';
export * from './ids';
export * from './model';
export * from './session';
export * from './utils/pgn-tags';

// (Next tasks will export ExplorerSession and model types here)
