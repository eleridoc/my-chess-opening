import { Injectable } from '@angular/core';
import type { DashboardOverviewInput, DashboardOverviewResult } from 'my-chess-opening-core';

/**
 * Thin Angular wrapper around Electron IPC for the Dashboard feature.
 *
 * Responsibilities:
 * - request the full Dashboard overview for a shared filter snapshot
 *
 * Notes:
 * - This service is intentionally transport-only.
 * - UI state management belongs to the Dashboard page layer.
 * - Data aggregation is handled by the Electron backend.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
	async getOverview(input: DashboardOverviewInput): Promise<DashboardOverviewResult> {
		if (!window.electron?.dashboard?.getOverview) {
			throw new Error('Electron dashboard API is not available');
		}

		return window.electron.dashboard.getOverview(input);
	}
}
