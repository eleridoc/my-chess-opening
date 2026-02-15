/**
 * SAN normalization used for ECO matching.
 *
 * IMPORTANT:
 * Keep this logic stable. It must match exactly what the matcher expects,
 * otherwise you will reduce hit rate.
 */
export function normalizeSan(input: string): string {
	let s = input.trim();

	// Normalize castling notations (some sources use 0-0 / 0-0-0).
	if (s === '0-0') s = 'O-O';
	if (s === '0-0-0') s = 'O-O-O';

	// Remove trailing check/mate markers.
	s = s.replace(/[+#]$/g, '');

	// Remove common annotation suffixes: !, ?, !!, ?!, etc.
	s = s.replace(/[!?]+$/g, '');

	// Collapse weird whitespace.
	s = s.replace(/\s+/g, ' ');

	return s;
}

export function normalizeSanLine(line: readonly string[]): string[] {
	return line.map((m) => normalizeSan(m));
}
