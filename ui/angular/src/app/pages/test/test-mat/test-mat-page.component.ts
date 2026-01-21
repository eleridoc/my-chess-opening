import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ViewChild, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeModule } from '@angular/material/tree';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource } from '@angular/material/tree';

import { map, startWith } from 'rxjs/operators';
import { Observable } from 'rxjs';

type DemoUser = {
	name: string;
	role: string;
	elo: number;
	active: boolean;
};

type DemoTreeNode = {
	name: string;
	children?: DemoTreeNode[];
};

@Component({
	selector: 'app-test-mat-page',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,

		MatToolbarModule,
		MatCardModule,
		MatDividerModule,
		MatIconModule,

		MatButtonModule,
		MatButtonToggleModule,
		MatMenuModule,
		MatTooltipModule,
		MatBadgeModule,

		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
		MatAutocompleteModule,
		MatDatepickerModule,
		MatNativeDateModule,
		MatRadioModule,
		MatCheckboxModule,
		MatSlideToggleModule,
		MatSliderModule,

		MatChipsModule,
		MatProgressBarModule,
		MatProgressSpinnerModule,
		MatSnackBarModule,

		MatTabsModule,
		MatExpansionModule,
		MatListModule,
		MatGridListModule,
		MatSidenavModule,
		MatTreeModule,

		MatTableModule,
		MatPaginatorModule,
		MatSortModule,

		MatStepperModule,
	],
	templateUrl: './test-mat-page.component.html',
	styleUrl: './test-mat-page.component.scss',
})
export class TestMatPageComponent implements AfterViewInit {
	/**
	 * Angular Material “showroom” page (no MatDialog).
	 * Goal: see styles / spacing / typography with your current theme.
	 *
	 * Notes:
	 * - This file intentionally imports many Material modules.
	 * - Prefer lazy-loading this route to avoid initial bundle budget issues.
	 */

	// -------------------------------------------------------------------------
	// Small UI state
	// -------------------------------------------------------------------------

	readonly sidenavOpened = signal(false);

	readonly demoForm = new FormGroup({
		name: new FormControl('Bertrand', { nonNullable: true, validators: [Validators.required] }),
		email: new FormControl('bertrand@example.com', {
			nonNullable: true,
			validators: [Validators.required, Validators.email],
		}),
		about: new FormControl('Testing Angular Material styles.', { nonNullable: true }),
		country: new FormControl('FR', { nonNullable: true }),
		date: new FormControl<Date | null>(new Date()),
		radio: new FormControl<'a' | 'b' | 'c'>('a', { nonNullable: true }),
		checkbox: new FormControl(true, { nonNullable: true }),
		toggle: new FormControl(false, { nonNullable: true }),
		slider: new FormControl(35, { nonNullable: true }),
	});

	readonly autoCtrl = new FormControl('Nf3', { nonNullable: true });

	private readonly openings = [
		'Italian Game',
		'Ruy Lopez',
		'Sicilian Defense',
		'French Defense',
		'Caro-Kann',
		'Queen’s Gambit',
		'King’s Indian Defense',
		'London System',
		'Nf3',
		'd4',
	] as const;

	readonly filteredOpenings$: Observable<string[]> = this.autoCtrl.valueChanges.pipe(
		startWith(this.autoCtrl.value),
		map((v) => (v ?? '').toLowerCase()),
		map((needle) => this.openings.filter((x) => x.toLowerCase().includes(needle)).slice(0, 8)),
	);

	constructor(private readonly snackBar: MatSnackBar) {
		// Initialize demo tree data.
		this.treeDataSource.data = [
			{
				name: 'Explorer',
				children: [
					{ name: 'Mainline' },
					{
						name: 'Variations',
						children: [{ name: 'Branch A' }, { name: 'Branch B' }],
					},
				],
			},
			{
				name: 'Import',
				children: [{ name: 'Chess.com' }, { name: 'Lichess' }],
			},
		];
	}

	showSnackBar(): void {
		this.snackBar.open('SnackBar example (theme colors + elevation).', 'OK', {
			duration: 2500,
		});
	}

	// -------------------------------------------------------------------------
	// Table demo
	// -------------------------------------------------------------------------

	displayedColumns: Array<keyof DemoUser> = ['name', 'role', 'elo', 'active'];

	readonly tableDataSource = new MatTableDataSource<DemoUser>([
		{ name: 'Eleridoc', role: 'Developer', elo: 1180, active: true },
		{ name: 'Alice', role: 'Analyst', elo: 1350, active: true },
		{ name: 'Bob', role: 'Tester', elo: 980, active: false },
		{ name: 'Carol', role: 'Designer', elo: 1420, active: true },
	]);

	@ViewChild(MatPaginator) paginator!: MatPaginator;
	@ViewChild(MatSort) sort!: MatSort;

	ngAfterViewInit(): void {
		this.tableDataSource.paginator = this.paginator;
		this.tableDataSource.sort = this.sort;
	}

	applyTableFilter(value: string): void {
		this.tableDataSource.filter = (value ?? '').trim().toLowerCase();
		if (this.tableDataSource.paginator) this.tableDataSource.paginator.firstPage();
	}

	// -------------------------------------------------------------------------
	// Tree demo
	// -------------------------------------------------------------------------

	readonly treeControl = new NestedTreeControl<DemoTreeNode>((n) => n.children ?? []);
	readonly treeDataSource = new MatTreeNestedDataSource<DemoTreeNode>();

	readonly hasChild = (_: number, node: DemoTreeNode) =>
		Array.isArray(node.children) && node.children.length > 0;

	// -------------------------------------------------------------------------
	// Stepper demo
	// -------------------------------------------------------------------------

	readonly step1 = new FormGroup({
		first: new FormControl('First step', { nonNullable: true, validators: [Validators.required] }),
	});

	readonly step2 = new FormGroup({
		second: new FormControl('Second step', {
			nonNullable: true,
			validators: [Validators.required],
		}),
	});
}
