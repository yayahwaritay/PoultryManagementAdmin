import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminOrdersService } from '../../core/admin/admin-orders.service';
import { OrderDto, OrderStatus } from '../../core/admin/admin.models';
import { ToastService } from '../../core/toast/toast.service';
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
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

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
    // Deep link from the Customers page's order history: /orders?orderId=<id>
    const orderId = this.route.snapshot.queryParamMap.get('orderId');
    if (orderId) this.openById(orderId);
  }

  private openById(id: string): void {
    this.api.get(id).subscribe({
      next: (order) => this.select(order),
      error: (err) => this.loadError.set(extractApiErrorMessage(err, 'Could not load that order.'))
    });
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
    const notes = this.adminNotes().trim();
    // The API allows an empty rejection note, but the customer should be told why.
    if (kind === 'reject' && !notes) {
      this.actionError.set('Please add a message telling the customer why the order was rejected.');
      return;
    }
    this.acting.set(kind);
    this.actionError.set(null);
    const request =
      kind === 'confirm'
        ? this.api.confirm(order.id, { adminNotes: notes || null })
        : this.api.reject(order.id, { adminNotes: notes || null });

    request.pipe(finalize(() => this.acting.set(null))).subscribe({
      next: (updated) => {
        this.orders.update((list) => list.map((o) => (o.id === updated.id ? updated : o)));
        this.selectedOrder.set(updated);
        const verb = kind === 'confirm' ? 'confirmed' : 'rejected';
        if (updated.customerEmail) {
          this.toast.success(`Order ${verb}. The customer has been notified by email.`);
        } else {
          this.toast.info(`Order ${verb}. No customer email on file, so no email was sent.`);
        }
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
