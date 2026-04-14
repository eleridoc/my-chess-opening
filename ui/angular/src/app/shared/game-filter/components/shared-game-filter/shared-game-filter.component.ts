import { CommonModule } from '@angular/common';
import {
	Component,
	EventEmitter,
	Input,
	OnChanges,
	OnInit,
	Output,
	SimpleChanges,
	inject,
	signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';

import {
	countActiveSharedGameFilterFields,
	getDefaultSharedGameFilterForContext,
	getVisibleSharedGameFilterFields,
	stripHiddenSharedGameFilterFields,
	usesSharedGameFilterCustomPlayedDates,
	type SharedGameFilter,
	type SharedGameFilterContext,
	type SharedGameFilterContextConfig,
	type SharedGameFilterFieldKey,
	type SharedGameFilterGameSpeed,
	type SharedGameFilterPeriodPreset,
	type SharedGameFilterPlatform,
	type SharedGameFilterPlayedColor,
	type SharedGameFilterPlayerResult,
	type SharedGameFilterRatedMode,
} from 'my-chess-opening-core';

import { SharedGameFilterContextService } from '../../services/shared-game-filter-context.service';
import { SharedGameFilterStorageService } from '../../services/shared-game-filter-storage.service';

/**
 * Shared reusable game filter shell.
 *
 * V1.7.6 scope:
 * - create the reusable component contract
 * - wire the form state to the context configuration and storage services
 * - expose Apply / Reset actions
 * - keep the template intentionally minimal until field blocks are introduced
 *   in the next V1.7.x tasks
 */
@Component({
	selector: 'app-shared-game-filter',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule, MatButtonModule],
	templateUrl: './shared-game-filter.component.html',
	styleUrl: './shared-game-filter.component.scss',
})
export class SharedGameFilterComponent implements OnInit, OnChanges {
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly sharedGameFilterContextService = inject(SharedGameFilterContextService);

	private hasInitialized = false;

	/** Usage context driving storage key and base configuration. */
	@Input() context: SharedGameFilterContext = 'default';

	/** Optional runtime configuration overrides layered on top of the context base config. */
	@Input() contextConfig: SharedGameFilterContextConfig | null = null;

	/**
	 * Optional initial value provided by a parent.
	 *
	 * When provided, it takes precedence over persisted storage on initial hydration.
	 */
	@Input() initialValue: SharedGameFilter | null = null;

	/** Disable the full form and its actions. */
	@Input() disabled = false;

	/**
	 * Whether Apply / Reset should use the storage service for the current context.
	 *
	 * Notes:
	 * - true: Apply persists to localStorage, Reset clears localStorage for the context
	 * - false: Apply / Reset operate only in memory
	 */
	@Input() persistInStorage = true;

	/** Whether the standard action row is rendered. */
	@Input() showActions = true;

	/** Apply button label. */
	@Input() applyButtonLabel = 'Apply';

	/** Reset button label. */
	@Input() resetButtonLabel = 'Reset';

	/** Emitted after Apply with the canonical filter value. */
	@Output() applyRequested = new EventEmitter<SharedGameFilter>();

	/** Emitted after Reset with the canonical filter value. */
	@Output() resetRequested = new EventEmitter<SharedGameFilter>();

	readonly visibleFields = signal<SharedGameFilterFieldKey[]>([]);
	readonly activeFieldCount = signal(0);
	readonly usesCustomPlayedDates = signal(false);

	private readonly resolvedContextConfig = signal<SharedGameFilterContextConfig>({});

	readonly form = new FormGroup({
		periodPreset: new FormControl<SharedGameFilterPeriodPreset>('all', {
			nonNullable: true,
		}),
		datePlayedFrom: new FormControl<string | null>(null),
		datePlayedTo: new FormControl<string | null>(null),
		playedColor: new FormControl<SharedGameFilterPlayedColor>('both', {
			nonNullable: true,
		}),
		playerResult: new FormControl<SharedGameFilterPlayerResult>('all', {
			nonNullable: true,
		}),
		gameSpeeds: new FormControl<SharedGameFilterGameSpeed[]>(['rapid'], {
			nonNullable: true,
		}),
		ratedMode: new FormControl<SharedGameFilterRatedMode>('ratedOnly', {
			nonNullable: true,
		}),
		platforms: new FormControl<SharedGameFilterPlatform[]>([], {
			nonNullable: true,
		}),
		ecoCodeExact: new FormControl<string>('', {
			nonNullable: true,
		}),
		openingNameContains: new FormControl<string>('', {
			nonNullable: true,
		}),
		gameIdExact: new FormControl<string>('', {
			nonNullable: true,
		}),
		playerRatingMin: new FormControl<number | null>(null),
		playerRatingMax: new FormControl<number | null>(null),
		opponentRatingMin: new FormControl<number | null>(null),
		opponentRatingMax: new FormControl<number | null>(null),
		ratingDiffMin: new FormControl<number | null>(null),
		ratingDiffMax: new FormControl<number | null>(null),
		playerTextSearch: new FormControl<string>('', {
			nonNullable: true,
		}),
	});

	constructor() {
		this.form.valueChanges.subscribe(() => {
			this.refreshDerivedState();
		});
	}

	ngOnInit(): void {
		this.hasInitialized = true;
		this.hydrateFormFromInputs();
		this.updateFormDisabledState();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (!this.hasInitialized) {
			return;
		}

		if (
			changes['context'] ||
			changes['contextConfig'] ||
			changes['initialValue'] ||
			changes['persistInStorage']
		) {
			this.hydrateFormFromInputs();
		}

		if (changes['disabled']) {
			this.updateFormDisabledState();
		}
	}

	onApply(): void {
		if (this.disabled) {
			return;
		}

		const resolvedConfig = this.resolvedContextConfig();
		const rawValue = this.form.getRawValue();

		const appliedFilter = this.persistInStorage
			? this.sharedGameFilterStorage.saveSharedGameFilter(this.context, rawValue, resolvedConfig)
			: stripHiddenSharedGameFilterFields(rawValue, resolvedConfig);

		this.writeSharedGameFilterToForm(appliedFilter);
		this.applyRequested.emit(appliedFilter);
	}

	onReset(): void {
		const resolvedConfig = this.resolvedContextConfig();

		const resetFilter = this.persistInStorage
			? this.sharedGameFilterStorage.resetSharedGameFilter(this.context, resolvedConfig)
			: getDefaultSharedGameFilterForContext(resolvedConfig);

		this.writeSharedGameFilterToForm(resetFilter);
		this.resetRequested.emit(resetFilter);
	}

	private hydrateFormFromInputs(): void {
		const resolvedConfig =
			this.sharedGameFilterContextService.getMergedSharedGameFilterContextConfig(
				this.context,
				this.contextConfig,
			);

		this.resolvedContextConfig.set(resolvedConfig);
		this.visibleFields.set(getVisibleSharedGameFilterFields(resolvedConfig));

		const initialFilter = this.resolveInitialSharedGameFilter(resolvedConfig);
		this.writeSharedGameFilterToForm(initialFilter);
	}

	private resolveInitialSharedGameFilter(
		resolvedConfig: SharedGameFilterContextConfig,
	): SharedGameFilter {
		if (this.initialValue !== null) {
			return stripHiddenSharedGameFilterFields(this.initialValue, resolvedConfig);
		}

		if (this.persistInStorage) {
			return this.sharedGameFilterStorage.loadSharedGameFilter(this.context, resolvedConfig);
		}

		return getDefaultSharedGameFilterForContext(resolvedConfig);
	}

	private writeSharedGameFilterToForm(filter: SharedGameFilter): void {
		const normalizedFilter = stripHiddenSharedGameFilterFields(
			filter,
			this.resolvedContextConfig(),
		);

		this.form.reset(
			{
				periodPreset: normalizedFilter.periodPreset,
				datePlayedFrom: normalizedFilter.datePlayedFrom,
				datePlayedTo: normalizedFilter.datePlayedTo,
				playedColor: normalizedFilter.playedColor,
				playerResult: normalizedFilter.playerResult,
				gameSpeeds: [...normalizedFilter.gameSpeeds],
				ratedMode: normalizedFilter.ratedMode,
				platforms: [...normalizedFilter.platforms],
				ecoCodeExact: normalizedFilter.ecoCodeExact,
				openingNameContains: normalizedFilter.openingNameContains,
				gameIdExact: normalizedFilter.gameIdExact,
				playerRatingMin: normalizedFilter.playerRatingMin,
				playerRatingMax: normalizedFilter.playerRatingMax,
				opponentRatingMin: normalizedFilter.opponentRatingMin,
				opponentRatingMax: normalizedFilter.opponentRatingMax,
				ratingDiffMin: normalizedFilter.ratingDiffMin,
				ratingDiffMax: normalizedFilter.ratingDiffMax,
				playerTextSearch: normalizedFilter.playerTextSearch,
			},
			{ emitEvent: false },
		);

		this.refreshDerivedState();
		this.updateFormDisabledState();
	}

	private refreshDerivedState(): void {
		const resolvedConfig = this.resolvedContextConfig();
		const normalizedVisibleFilter = stripHiddenSharedGameFilterFields(
			this.form.getRawValue(),
			resolvedConfig,
		);

		this.activeFieldCount.set(
			countActiveSharedGameFilterFields(normalizedVisibleFilter, resolvedConfig),
		);
		this.usesCustomPlayedDates.set(
			usesSharedGameFilterCustomPlayedDates(normalizedVisibleFilter.periodPreset),
		);
	}

	private updateFormDisabledState(): void {
		if (this.disabled) {
			this.form.disable({ emitEvent: false });
			return;
		}

		this.form.enable({ emitEvent: false });
	}
}
