import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'info' | 'danger';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** App-wide transient notifications, rendered by the `Toasts` component in the app root. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.show('success', message);
  }

  info(message: string): void {
    this.show('info', message);
  }

  danger(message: string): void {
    this.show('danger', message, 8000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(kind: ToastKind, message: string, durationMs = 6000): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }
}
