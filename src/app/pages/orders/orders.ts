import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminOrdersService } from '../../core/admin/admin-orders.service';
import { OrderDto, OrderStatus } from '../../core/admin/admin.models';
import { extractApiErrorMessage } from '../../core/api-error';

const STATUSES: OrderStatus[] = ['Pending', 'Confirmed', 'Rejected', 'Completed', 'Cancelled'];

@Component({
  selector: 'app-orders',
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css'
})
export class Orders {
  private readonly api = inject(AdminOrdersService);

  readonly statuses = STATUSES;
  readonly orders = signal<OrderDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly statusFilter = signal<OrderStatus | ''>('Pending');

  readonly selectedOrder = signal<OrderDto | null>(null);
  readonly adminNotes = signal('');
  readonly actionError = signal<string | null>(null);
  readonly acting = signal<'confirm' | 'reject' | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list(this.statusFilter()).subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(extractApiErrorMessage(err, 'Could not load orders.'));
        this.loading.set(false);
      }
    });
  }

  applyFilter(): void {
    this.load();
  }

  select(order: OrderDto): void {
    this.selectedOrder.set(order);
    this.adminNotes.set(order.adminNotes ?? '');
    this.actionError.set(null);
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
  }

  confirm(): void {
    this.runAction('confirm');
  }

  reject(): void {
    this.runAction('reject');
  }

  private runAction(kind: 'confirm' | 'reject'): void {
    const order = this.selectedOrder();
    if (!order || this.acting()) return;
    this.acting.set(kind);
    this.actionError.set(null);
    const request =
      kind === 'confirm'
        ? this.api.confirm(order.id, { adminNotes: this.adminNotes() || null })
        : this.api.reject(order.id, { adminNotes: this.adminNotes() || null });

    request.pipe(finalize(() => this.acting.set(null))).subscribe({
      next: (updated) => {
        this.orders.update((list) => list.map((o) => (o.id === updated.id ? updated : o)));
        this.selectedOrder.set(updated);
      },
      error: (err) =>
        this.actionError.set(extractApiErrorMessage(err, `Could not ${kind} this order.`))
    });
  }

  statusBadgeClass(status: OrderStatus): string {
    switch (status) {
      case 'Confirmed':
      case 'Completed':
        return 'badge-success';
      case 'Rejected':
      case 'Cancelled':
        return 'badge-danger';
      default:
        return 'badge-warning';
    }
  }
}
