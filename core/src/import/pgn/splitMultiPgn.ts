export function splitMultiPgn(multi: string): string[] {
	const trimmed = multi.trim();
	if (!trimmed) return [];

	// Many exports separate games by a blank line before the next "[Event"
	const parts = trimmed.split(/\n\n(?=\[Event\s")/g);
	return parts.map((p) => p.trim()).filter(Boolean);
}
