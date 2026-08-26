import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminTransactionsService } from '../../core/admin/admin-transactions.service';
import {
  TransactionDto,
  TransactionFilter,
  TransactionStatus,
  TransactionSummaryDto
} from '../../core/admin/admin.models';
import { extractApiErrorMessage } from '../../core/api-error';

const STATUSES: TransactionStatus[] = ['Pending', 'Success', 'Failed', 'Reconciled'];

@Component({
  selector: 'app-transactions',
  imports: [DatePipe, DecimalPipe, KeyValuePipe, FormsModule],
  templateUrl: './transactions.html',
  styleUrl: './transactions.css'
})
export class Transactions {
  private readonly api = inject(AdminTransactionsService);

  readonly statuses = STATUSES;
  readonly transactions = signal<TransactionDto[]>([]);
  readonly summary = signal<TransactionSummaryDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly filter = signal<TransactionFilter>({ status: '', provider: '', from: '', to: '' });

  readonly reconcilingId = signal<string | null>(null);
  readonly reconcileStatus = signal<'Reconciled' | 'Failed'>('Reconciled');
  readonly reconcileNotes = signal('');
  readonly reconcileError = signal<string | null>(null);
  readonly reconciling = signal(false);

  constructor() {
    this.load();
  }

  updateFilter(patch: Partial<TransactionFilter>): void {
    this.filter.update((f) => ({ ...f, ...patch }));
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const f = this.filter();
    this.api.list(f).subscribe({
      next: (transactions) => {
        this.transactions.set(transactions);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(extractApiErrorMessage(err, 'Could not load transactions.'));
        this.loading.set(false);
      }
    });
    this.api.summary(f.from || undefined, f.to || undefined).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => {
        /* stat tiles just stay hidden if the summary call fails */
      }
    });
  }

  startReconcile(transaction: TransactionDto): void {
    this.reconcilingId.set(transaction.id);
    this.reconcileStatus.set('Reconciled');
    this.reconcileNotes.set(transaction.notes ?? '');
    this.reconcileError.set(null);
  }

  cancelReconcile(): void {
    this.reconcilingId.set(null);
  }

  submitReconcile(transaction: TransactionDto): void {
    this.reconciling.set(true);
    this.reconcileError.set(null);
    this.api
      .reconcile(transaction.id, { status: this.reconcileStatus(), notes: this.reconcileNotes() || null })
      .pipe(finalize(() => this.reconciling.set(false)))
      .subscribe({
        next: (updated) => {
          this.transactions.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
          this.reconcilingId.set(null);
        },
        error: (err) => this.reconcileError.set(extractApiErrorMessage(err, 'Could not reconcile this transaction.'))
      });
  }

  statusBadgeClass(status: TransactionStatus): string {
    switch (status) {
      case 'Reconciled':
      case 'Success':
        return 'badge-success';
      case 'Failed':
        return 'badge-danger';
      default:
        return 'badge-warning';
    }
  }
}
