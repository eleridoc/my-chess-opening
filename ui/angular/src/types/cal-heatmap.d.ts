declare module 'cal-heatmap' {
	/**
	 * Minimal local declaration for cal-heatmap.
	 *
	 * The installed package is used as an ESM dependency, but some package
	 * versions do not expose TypeScript declarations in a way Angular can read.
	 *
	 * Keep this declaration intentionally small and aligned with the Dashboard
	 * wrapper needs.
	 */
	export default class CalHeatmap {
		paint(options?: Record<string, unknown>, plugins?: unknown[]): Promise<void>;

		destroy(): Promise<void>;
	}
}

declare module 'cal-heatmap/plugins/Tooltip' {
	const Tooltip: unknown;

	export default Tooltip;
}
