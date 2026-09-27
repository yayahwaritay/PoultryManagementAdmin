import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './core/toast/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
