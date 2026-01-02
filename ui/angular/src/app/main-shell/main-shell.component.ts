import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
	selector: 'app-main-shell',
	standalone: true,
	imports: [RouterOutlet, MatToolbarModule, MatButtonModule],
	templateUrl: './main-shell.component.html',
	styleUrl: './main-shell.component.scss',
})
export class MainShellComponent {
	// Placeholder for future main application shell
}
