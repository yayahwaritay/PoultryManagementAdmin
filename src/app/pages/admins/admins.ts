import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { SuperAdminAdminsService } from '../../core/admin/superadmin-admins.service';
import { AdminUserDto } from '../../core/admin/admin.models';
import { AdminPermission } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { extractApiErrorMessage, extractFieldErrors } from '../../core/api-error';

const ALL_PERMISSIONS: AdminPermission[] = ['ManageProducts', 'ConfirmOrders'];

interface PermissionsDraft {
  ManageProducts: boolean;
  ConfirmOrders: boolean;
  isActive: boolean;
}

/** Password state per EMAIL-NOTIFICATIONS-README.md §1.3. */
export type PasswordStatus = 'set' | 'awaiting' | 'expired';

@Component({
  selector: 'app-admins',
  imports: [ReactiveFormsModule, FormsModule, DatePipe],
  templateUrl: './admins.html',
  styleUrl: './admins.css'
})
export class Admins {
  private readonly api = inject(SuperAdminAdminsService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly allPermissions = ALL_PERMISSIONS;
  readonly currentAdminId = this.auth.adminId;
  readonly admins = signal<AdminUserDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly showCreateForm = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createFieldErrors = signal<Record<string, string>>({});

  readonly editingId = signal<string | null>(null);
  readonly editDraft = signal<PermissionsDraft>({ ManageProducts: false, ConfirmOrders: false, isActive: true });
  readonly savingEdit = signal(false);
  readonly editError = signal<string | null>(null);

  readonly deactivatingId = signal<string | null>(null);
  readonly resettingId = signal<string | null>(null);
  readonly rowError = signal<string | null>(null);

  readonly emailTarget = signal<AdminUserDto | null>(null);
  readonly emailDraft = signal('');
  readonly savingEmail = signal(false);
  readonly emailError = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    manageProducts: [false],
    confirmOrders: [false]
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list().subscribe({
      next: (admins) => {
        this.admins.set(admins);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(extractApiErrorMessage(err, 'Could not load admins.'));
        this.loading.set(false);
      }
    });
  }

  passwordStatus(admin: AdminUserDto): PasswordStatus {
    if (!admin.mustChangePassword) return 'set';
    const expiresAt = admin.defaultPasswordExpiresAt ? new Date(admin.defaultPasswordExpiresAt).getTime() : null;
    return expiresAt !== null && expiresAt <= Date.now() ? 'expired' : 'awaiting';
  }

  toggleCreateForm(): void {
    this.showCreateForm.update((v) => !v);
    this.createError.set(null);
    this.createFieldErrors.set({});
    this.createForm.reset({ username: '', email: '', manageProducts: false, confirmOrders: false });
  }

  submitCreate(): void {
    if (this.createForm.invalid || this.creating()) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { username, email, manageProducts, confirmOrders } = this.createForm.getRawValue();
    const permissions: AdminPermission[] = [
      ...(manageProducts ? (['ManageProducts'] as const) : []),
      ...(confirmOrders ? (['ConfirmOrders'] as const) : [])
    ];

    this.creating.set(true);
    this.createError.set(null);
    this.createFieldErrors.set({});
    // No password: the server generates one and emails it, so the Super Admin never sees it.
    this.api
      .create({ username: username.trim(), email: email.trim(), permissions })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (admin) => {
          this.admins.update((list) => [...list, admin]);
          this.showCreateForm.set(false);
          this.toast.success(
            `Admin created. Login details have been emailed to ${admin.email ?? email}. ` +
              'They must sign in and change the password within 24 hours.'
          );
        },
        error: (err) => {
          const fieldErrors = extractFieldErrors(err);
          this.createFieldErrors.set(fieldErrors);
          if (Object.keys(fieldErrors).length === 0) {
            this.createError.set(extractApiErrorMessage(err, 'Could not create admin.'));
          }
        }
      });
  }

  startEdit(admin: AdminUserDto): void {
    this.editingId.set(admin.id);
    this.editError.set(null);
    this.editDraft.set({
      ManageProducts: admin.permissions.includes('ManageProducts'),
      ConfirmOrders: admin.permissions.includes('ConfirmOrders'),
      isActive: admin.isActive
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  updateDraft(patch: Partial<PermissionsDraft>): void {
    this.editDraft.update((d) => ({ ...d, ...patch }));
  }

  saveEdit(admin: AdminUserDto): void {
    const draft = this.editDraft();
    const permissions: AdminPermission[] = [
      ...(draft.ManageProducts ? (['ManageProducts'] as const) : []),
      ...(draft.ConfirmOrders ? (['ConfirmOrders'] as const) : [])
    ];
    this.savingEdit.set(true);
    this.editError.set(null);
    this.api
      .updatePermissions(admin.id, { permissions, isActive: draft.isActive })
      .pipe(finalize(() => this.savingEdit.set(false)))
      .subscribe({
        next: (updated) => {
          this.replaceAdmin(updated);
          this.editingId.set(null);
        },
        error: (err) => this.editError.set(extractApiErrorMessage(err, 'Could not save changes.'))
      });
  }

  openEmailDialog(admin: AdminUserDto): void {
    this.emailTarget.set(admin);
    this.emailDraft.set(admin.email ?? '');
    this.emailError.set(null);
  }

  closeEmailDialog(): void {
    if (this.savingEmail()) return;
    this.emailTarget.set(null);
  }

  saveEmail(): void {
    const admin = this.emailTarget();
    const email = this.emailDraft().trim();
    if (!admin || this.savingEmail()) return;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.emailError.set('Enter a valid email address.');
      return;
    }
    if (email.length > 200) {
      this.emailError.set('Email must be 200 characters or fewer.');
      return;
    }

    this.savingEmail.set(true);
    this.emailError.set(null);
    this.api
      .updateEmail(admin.id, { email })
      .pipe(finalize(() => this.savingEmail.set(false)))
      .subscribe({
        next: (updated) => {
          this.replaceAdmin(updated);
          this.emailTarget.set(null);
          this.toast.success(`Email for ${updated.username} updated to ${updated.email}.`);
        },
        error: (err) =>
          this.emailError.set(
            extractFieldErrors(err)['email'] ?? extractApiErrorMessage(err, 'Could not update the email.')
          )
      });
  }

  resetPassword(admin: AdminUserDto): void {
    if (!admin.email) {
      this.rowError.set(`${admin.username} has no email address. Set an email first, then reset the password.`);
      return;
    }
    const confirmed = confirm(
      `Reset password for ${admin.username}? Their current password will stop working and a new ` +
        'temporary password will be emailed to them.'
    );
    if (!confirmed) return;

    this.resettingId.set(admin.id);
    this.rowError.set(null);
    this.api
      .resetPassword(admin.id)
      .pipe(finalize(() => this.resettingId.set(null)))
      .subscribe({
        next: (updated) => {
          this.replaceAdmin(updated);
          this.toast.success(`A new temporary password has been emailed to ${updated.email ?? admin.email}.`);
        },
        error: (err) => this.rowError.set(extractApiErrorMessage(err, 'Could not reset the password.'))
      });
  }

  deactivate(admin: AdminUserDto): void {
    if (!confirm(`Deactivate admin "${admin.username}"? They will no longer be able to sign in.`)) return;
    this.deactivatingId.set(admin.id);
    this.rowError.set(null);
    this.api.deactivate(admin.id).subscribe({
      next: () => {
        this.admins.update((list) =>
          list.map((a) => (a.id === admin.id ? { ...a, isActive: false } : a))
        );
        this.deactivatingId.set(null);
      },
      error: (err) => {
        this.rowError.set(extractApiErrorMessage(err, 'Could not deactivate this admin.'));
        this.deactivatingId.set(null);
      }
    });
  }

  private replaceAdmin(updated: AdminUserDto): void {
    this.admins.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  }
}
