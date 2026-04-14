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
import {
	AbstractControl,
	FormControl,
	FormGroup,
	ReactiveFormsModule,
	ValidationErrors,
	ValidatorFn,
} from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
	SHARED_GAME_FILTER_GAME_SPEEDS,
	SHARED_GAME_FILTER_PERIOD_PRESETS,
	SHARED_GAME_FILTER_PLATFORMS,
	SHARED_GAME_FILTER_PLAYED_COLORS,
	SHARED_GAME_FILTER_PLAYER_RESULTS,
	SHARED_GAME_FILTER_RATED_MODES,
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
 * Build a validator for a numeric min/max pair.
 *
 * The validator stays permissive when one side is missing. It only reports an
 * error when both values are present and min is greater than max.
 */
function createSharedGameFilterMinMaxValidator(
	minControlName: keyof SharedGameFilter,
	maxControlName: keyof SharedGameFilter,
	errorKey: string,
): ValidatorFn {
	return (control: AbstractControl): ValidationErrors | null => {
		const minValue = control.get(minControlName)?.value;
		const maxValue = control.get(maxControlName)?.value;

		if (minValue === null || maxValue === null) {
			return null;
		}

		if (typeof minValue !== 'number' || typeof maxValue !== 'number') {
			return null;
		}

		return minValue <= maxValue ? null : { [errorKey]: true };
	};
}

/**
 * Validate the custom played date range.
 *
 * Rules:
 * - only applies when periodPreset is "custom"
 * - allows incomplete input
 * - reports an error only when both dates are present and from > to
 */
function createSharedGameFilterPlayedDateRangeValidator(): ValidatorFn {
	return (control: AbstractControl): ValidationErrors | null => {
		const periodPreset = control.get('periodPreset')?.value;
		const datePlayedFrom = control.get('datePlayedFrom')?.value;
		const datePlayedTo = control.get('datePlayedTo')?.value;

		if (periodPreset !== 'custom') {
			return null;
		}

		if (
			typeof datePlayedFrom !== 'string' ||
			datePlayedFrom === '' ||
			typeof datePlayedTo !== 'string' ||
			datePlayedTo === ''
		) {
			return null;
		}

		return datePlayedFrom <= datePlayedTo ? null : { playedDateRange: true };
	};
}

/**
 * Shared reusable game filter shell.
 *
 * V1.7.9 scope:
 * - add form-level validations
 * - block Apply when invalid
 * - expose validation feedback in the UI
 * - keep storage/apply/reset behavior unchanged for valid values
 */
@Component({
	selector: 'app-shared-game-filter',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatButtonModule,
		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
	],
	templateUrl: './shared-game-filter.component.html',
	styleUrl: './shared-game-filter.component.scss',
})
export class SharedGameFilterComponent implements OnInit, OnChanges {
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly sharedGameFilterContextService = inject(SharedGameFilterContextService);

	private hasInitialized = false;

	readonly periodPresetOptions = SHARED_GAME_FILTER_PERIOD_PRESETS;
	readonly playedColorOptions = SHARED_GAME_FILTER_PLAYED_COLORS;
	readonly playerResultOptions = SHARED_GAME_FILTER_PLAYER_RESULTS;
	readonly ratedModeOptions = SHARED_GAME_FILTER_RATED_MODES;
	readonly gameSpeedOptions = SHARED_GAME_FILTER_GAME_SPEEDS;
	readonly platformOptions = SHARED_GAME_FILTER_PLATFORMS;

	readonly mainFieldKeys: ReadonlyArray<SharedGameFilterFieldKey> = [
		'periodPreset',
		'datePlayedFrom',
		'datePlayedTo',
		'playedColor',
		'playerResult',
		'gameSpeeds',
		'ratedMode',
		'platforms',
	];

	readonly complementaryFieldKeys: ReadonlyArray<SharedGameFilterFieldKey> = [
		'ecoCodeExact',
		'openingNameContains',
		'gameIdExact',
		'playerTextSearch',
		'playerRatingMin',
		'playerRatingMax',
		'opponentRatingMin',
		'opponentRatingMax',
		'ratingDiffMin',
		'ratingDiffMax',
	];

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
	readonly submitAttempted = signal(false);

	private readonly resolvedContextConfig = signal<SharedGameFilterContextConfig>({});

	readonly form = new FormGroup(
		{
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
		},
		{
			validators: [
				createSharedGameFilterPlayedDateRangeValidator(),
				createSharedGameFilterMinMaxValidator(
					'playerRatingMin',
					'playerRatingMax',
					'playerRatingRange',
				),
				createSharedGameFilterMinMaxValidator(
					'opponentRatingMin',
					'opponentRatingMax',
					'opponentRatingRange',
				),
				createSharedGameFilterMinMaxValidator('ratingDiffMin', 'ratingDiffMax', 'ratingDiffRange'),
			],
		},
	);

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

		this.submitAttempted.set(true);
		this.form.markAllAsTouched();
		this.form.updateValueAndValidity({ emitEvent: false });

		if (this.form.invalid) {
			this.refreshDerivedState();
			return;
		}

		const resolvedConfig = this.resolvedContextConfig();
		const rawValue = this.form.getRawValue();

		const appliedFilter = this.persistInStorage
			? this.sharedGameFilterStorage.saveSharedGameFilter(this.context, rawValue, resolvedConfig)
			: stripHiddenSharedGameFilterFields(rawValue, resolvedConfig);

		this.writeSharedGameFilterToForm(appliedFilter);
		this.submitAttempted.set(false);
		this.applyRequested.emit(appliedFilter);
	}

	onReset(): void {
		const resolvedConfig = this.resolvedContextConfig();

		const resetFilter = this.persistInStorage
			? this.sharedGameFilterStorage.resetSharedGameFilter(this.context, resolvedConfig)
			: getDefaultSharedGameFilterForContext(resolvedConfig);

		this.submitAttempted.set(false);
		this.writeSharedGameFilterToForm(resetFilter);
		this.form.markAsPristine();
		this.form.markAsUntouched();
		this.resetRequested.emit(resetFilter);
	}

	getPeriodPresetLabel(value: SharedGameFilterPeriodPreset): string {
		switch (value) {
			case 'all':
				return 'All';
			case 'today':
				return 'Today';
			case 'last7Days':
				return 'Last 7 days';
			case 'last30Days':
				return 'Last 30 days';
			case 'thisMonth':
				return 'This month';
			case 'last3Months':
				return 'Last 3 months';
			case 'last6Months':
				return 'Last 6 months';
			case 'thisYear':
				return 'This year';
			case 'custom':
				return 'Custom';
		}
	}

	getPlayedColorLabel(value: SharedGameFilterPlayedColor): string {
		switch (value) {
			case 'both':
				return 'Both colors';
			case 'white':
				return 'White';
			case 'black':
				return 'Black';
		}
	}

	getPlayerResultLabel(value: SharedGameFilterPlayerResult): string {
		switch (value) {
			case 'all':
				return 'All results';
			case 'win':
				return 'Win';
			case 'loss':
				return 'Loss';
			case 'draw':
				return 'Draw';
		}
	}

	getRatedModeLabel(value: SharedGameFilterRatedMode): string {
		switch (value) {
			case 'ratedOnly':
				return 'Rated only';
			case 'casualOnly':
				return 'Casual only';
			case 'both':
				return 'Rated and casual';
		}
	}

	getGameSpeedLabel(value: SharedGameFilterGameSpeed): string {
		switch (value) {
			case 'bullet':
				return 'Bullet';
			case 'blitz':
				return 'Blitz';
			case 'rapid':
				return 'Rapid';
		}
	}

	getPlatformLabel(value: SharedGameFilterPlatform): string {
		switch (value) {
			case 'lichess':
				return 'Lichess';
			case 'chessCom':
				return 'Chess.com';
			case 'other':
				return 'Other';
		}
	}

	isFieldVisible(fieldKey: SharedGameFilterFieldKey): boolean {
		return this.visibleFields().includes(fieldKey);
	}

	hasAnyVisibleFields(fieldKeys: ReadonlyArray<SharedGameFilterFieldKey>): boolean {
		const visibleFields = this.visibleFields();
		return fieldKeys.some((fieldKey) => visibleFields.includes(fieldKey));
	}

	showCustomPlayedDateFields(): boolean {
		return (
			this.usesCustomPlayedDates() &&
			(this.isFieldVisible('datePlayedFrom') || this.isFieldVisible('datePlayedTo'))
		);
	}

	shouldShowValidationError(errorKey: string): boolean {
		return !!this.form.errors?.[errorKey] && (this.form.touched || this.submitAttempted());
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
		this.submitAttempted.set(false);
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

		this.form.updateValueAndValidity({ emitEvent: false });
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
