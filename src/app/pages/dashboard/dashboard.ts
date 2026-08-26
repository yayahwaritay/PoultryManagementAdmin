import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminOrdersService } from '../../core/admin/admin-orders.service';
import { AdminTransactionsService } from '../../core/admin/admin-transactions.service';
import { TransactionSummaryDto } from '../../core/admin/admin.models';

interface QuickLink {
  label: string;
  description: string;
  path: string;
  visible: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly transactionsApi = inject(AdminTransactionsService);

  readonly username = this.auth.username;
  readonly isSuperAdmin = this.auth.isSuperAdmin;
  readonly canConfirmOrders = this.auth.hasPermission('ConfirmOrders');
  readonly canManageProducts = this.auth.hasPermission('ManageProducts');

  readonly pendingOrderCount = signal<number | null>(null);
  readonly summary = signal<TransactionSummaryDto | null>(null);
  readonly loadError = signal<string | null>(null);

  readonly quickLinks: QuickLink[] = [
    {
      label: 'Products',
      description: 'Add, edit and deactivate live birds, eggs, feed and other farm products.',
      path: '/products',
      visible: this.canManageProducts
    },
    {
      label: 'Categories',
      description: 'Organize the product category tree (birds, eggs, feed, equipment…).',
      path: '/categories',
      visible: this.canManageProducts
    },
    {
      label: 'Orders',
      description: 'Confirm or reject incoming customer orders.',
      path: '/orders',
      visible: this.canConfirmOrders
    },
    {
      label: 'Transactions',
      description: 'Reconcile payments against provider statements.',
      path: '/transactions',
      visible: this.canConfirmOrders
    },
    {
      label: 'Admins',
      description: 'Create Admin accounts and manage their permissions.',
      path: '/admins',
      visible: this.isSuperAdmin()
    }
  ];

  constructor() {
    if (this.canConfirmOrders) {
      this.ordersApi.list('Pending').subscribe({
        next: (orders) => this.pendingOrderCount.set(orders.length),
        error: () => this.loadError.set('Could not load pending order count.')
      });
      this.transactionsApi.summary().subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.loadError.set('Could not load transaction summary.')
      });
    }
  }
}
