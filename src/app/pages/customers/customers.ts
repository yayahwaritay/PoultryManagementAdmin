import { Component, WritableSignal, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { SuperAdminCustomersService } from '../../core/admin/superadmin-customers.service';
import {
  CustomerDetailDto,
  CustomerDto,
  OrderStatus,
  UpdateCustomerRequest
} from '../../core/admin/admin.models';
import { ToastService } from '../../core/toast/toast.service';
import { extractApiErrorMessage, extractFieldErrors } from '../../core/api-error';

type ActiveFilter = '' | 'true' | 'false';

/** Temporary-password state per CUSTOMER-PASSWORD-RESET-README.md §1.2. */
export type CustomerPasswordStatus = 'own' | 'sent' | 'expired';

/** Super Admin — view, edit and activate/deactivate customer accounts (BACKEND-README.md). */
@Component({
  selector: 'app-customers',
  imports: [DatePipe, DecimalPipe, NgTemplateOutlet, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './customers.html',
  styleUrl: './customers.css'
})
export class Customers {
  private readonly api = inject(SuperAdminCustomersService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly customers = signal<CustomerDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly search = signal('');
  readonly activeFilter = signal<ActiveFilter>('');

  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<CustomerDetailDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);

  readonly saving = signal(false);
  readonly togglingActive = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  readonly resettingId = signal<string | null>(null);
  /** Set when a reset was refused because the account is deactivated — offers reactivation. */
  readonly resetBlockedMessage = signal<string | null>(null);

  readonly editForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    phone: ['', [Validators.required, Validators.maxLength(30)]]
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const active = this.activeFilter();
    this.api.list({ search: this.search(), isActive: active === '' ? null : active === 'true' }).subscribe({
      next: (customers) => {
        this.customers.set(customers);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(extractApiErrorMessage(err, 'Could not load customers.'));
        this.loading.set(false);
      }
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.activeFilter.set('');
    this.load();
  }

  select(customer: CustomerDto): void {
    this.selectedId.set(customer.id);
    this.detail.set(null);
    this.detailError.set(null);
    this.saveError.set(null);
    this.fieldErrors.set({});
    this.resetBlockedMessage.set(null);
    this.detailLoading.set(true);
    this.api
      .get(customer.id)
      .pipe(finalize(() => this.detailLoading.set(false)))
      .subscribe({
        next: (detail) => {
          if (this.selectedId() !== detail.id) return;
          this.setDetail(detail);
        },
        error: (err) => this.detailError.set(extractApiErrorMessage(err, 'Could not load this customer.'))
      });
  }

  closeDetail(): void {
    this.selectedId.set(null);
    this.detail.set(null);
  }

  resetForm(): void {
    const detail = this.detail();
    if (detail) this.patchForm(detail);
    this.saveError.set(null);
    this.fieldErrors.set({});
  }

  /** Saves only the fields the Super Admin actually edited. */
  save(): void {
    const detail = this.detail();
    if (!detail || this.saving()) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();
    const changes: UpdateCustomerRequest = {};
    const fullName = value.fullName.trim();
    const email = value.email.trim().toLowerCase();
    const phone = value.phone.trim();
    if (fullName !== detail.fullName) changes.fullName = fullName;
    if (email !== detail.email.toLowerCase()) changes.email = email;
    if (phone !== detail.phone) changes.phone = phone;

    if (Object.keys(changes).length === 0) {
      this.toast.info('No changes to save.');
      return;
    }

    if (changes.email) {
      const confirmed = confirm(
        `Change ${detail.fullName}'s login email from ${detail.email} to ${changes.email}? ` +
          'They will need to sign in with the new address. A notice will also be sent to the old address.'
      );
      if (!confirmed) return;
    }

    this.submitUpdate(detail, changes, this.saving);
  }

  toggleActive(): void {
    const detail = this.detail();
    if (!detail || this.togglingActive()) return;
    const activate = !detail.isActive;
    const message = activate
      ? `Reactivate ${detail.fullName}? They will be able to sign in and place orders again, and will be notified by email.`
      : `Deactivate ${detail.fullName}? They will no longer be able to sign in or place orders, and will be ` +
        'notified by email. If they are signed in right now, their session stays valid until it expires.';
    if (!confirm(message)) return;

    this.submitUpdate(detail, { isActive: activate }, this.togglingActive);
  }

  passwordStatus(customer: CustomerDto): CustomerPasswordStatus {
    if (!customer.mustChangePassword) return 'own';
    const expiresAt = customer.temporaryPasswordExpiresAt
      ? new Date(customer.temporaryPasswordExpiresAt).getTime()
      : null;
    return expiresAt !== null && expiresAt <= Date.now() ? 'expired' : 'sent';
  }

  /**
   * POST /api/superadmin/customers/{id}/reset-password — emails a new temporary password.
   * The password itself is never returned; it only goes to the customer's inbox.
   */
  resetPassword(customer: CustomerDto, event?: Event): void {
    event?.stopPropagation();
    if (this.resettingId()) return;
    const confirmed = confirm(
      `Reset ${customer.fullName}'s password? Their current password will stop working right away and a ` +
        `temporary password will be emailed to ${customer.email}.

` +
        'If that email address is wrong, cancel and correct it first.'
    );
    if (!confirmed) return;

    this.resettingId.set(customer.id);
    this.resetBlockedMessage.set(null);
    this.api
      .resetPassword(customer.id)
      .pipe(finalize(() => this.resettingId.set(null)))
      .subscribe({
        next: (updated) => {
          if (this.selectedId() === updated.id) this.setDetail(updated);
          this.customers.update((list) =>
            list.map((c) => (c.id === updated.id ? this.toListRow(updated) : c))
          );
          this.toast.success(
            `A temporary password has been emailed to ${updated.email}. It expires in 24 hours.`
          );
        },
        error: (err) => {
          if (err?.status === 404) {
            this.toast.danger('Customer not found.');
            return;
          }
          const message = extractApiErrorMessage(err, 'Could not reset the password.');
          if (err?.status === 400 && !customer.isActive) {
            // Deactivated accounts can't be reset: open the customer and offer to reactivate.
            if (this.selectedId() !== customer.id) this.select(customer);
            this.resetBlockedMessage.set(message);
            return;
          }
          this.toast.danger(message);
        }
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

  private submitUpdate(
    detail: CustomerDetailDto,
    changes: UpdateCustomerRequest,
    busy: WritableSignal<boolean>
  ): void {
    busy.set(true);
    this.saveError.set(null);
    this.fieldErrors.set({});
    this.api
      .update(detail.id, changes)
      .pipe(finalize(() => busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.setDetail(updated);
          this.customers.update((list) =>
            list.map((c) => (c.id === updated.id ? this.toListRow(updated) : c))
          );
          this.toast.success("Customer updated. They've been notified by email.");
        },
        error: (err) => {
          const fieldErrors = extractFieldErrors(err);
          this.fieldErrors.set(fieldErrors);
          if (Object.keys(fieldErrors).length === 0) {
            this.saveError.set(extractApiErrorMessage(err, 'Could not update this customer.'));
          }
        }
      });
  }

  private setDetail(detail: CustomerDetailDto): void {
    this.detail.set(detail);
    if (detail.isActive) this.resetBlockedMessage.set(null);
    this.patchForm(detail);
  }

  private patchForm(detail: CustomerDetailDto): void {
    this.editForm.reset({ fullName: detail.fullName, email: detail.email, phone: detail.phone });
  }

  private toListRow({ orders: _orders, ...row }: CustomerDetailDto): CustomerDto {
    return row;
  }
}
