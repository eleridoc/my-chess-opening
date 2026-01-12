import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
	selector: 'app-app-layout',
	standalone: true,
	imports: [RouterOutlet, MatToolbarModule, MatButtonModule],
	templateUrl: './app-layout.component.html',
	styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent {
	// Placeholder for future main application shell
}
