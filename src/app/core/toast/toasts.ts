import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <div class="toast" [class]="'toast-' + toast.kind" role="status">
          <span>{{ toast.message }}</span>
          <button type="button" class="toast-close" aria-label="Dismiss" (click)="dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-stack {
      position: fixed;
      right: 1.25rem;
      bottom: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      z-index: 1000;
      max-width: min(420px, calc(100vw - 2.5rem));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.8rem 1rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #fff;
      font-size: 0.875rem;
      box-shadow: 0 10px 25px rgba(2, 6, 23, 0.15);
    }
    .toast span {
      flex: 1;
    }
    .toast-success {
      border-color: #bbf7d0;
      background: var(--success-light);
      color: var(--success);
    }
    .toast-danger {
      border-color: #fecaca;
      background: var(--danger-light);
      color: var(--danger);
    }
    .toast-info {
      color: var(--ink-900);
    }
    .toast-close {
      background: none;
      border: none;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      color: inherit;
      opacity: 0.7;
    }
  `
})
export class Toasts {
  private readonly toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
