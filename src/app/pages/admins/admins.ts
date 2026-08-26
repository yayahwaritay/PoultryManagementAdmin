import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { SuperAdminAdminsService } from '../../core/admin/superadmin-admins.service';
import { AdminUserDto } from '../../core/admin/admin.models';
import { AdminPermission } from '../../core/auth/auth.models';
import { extractApiErrorMessage } from '../../core/api-error';

const ALL_PERMISSIONS: AdminPermission[] = ['ManageProducts', 'ConfirmOrders'];

interface PermissionsDraft {
  ManageProducts: boolean;
  ConfirmOrders: boolean;
  isActive: boolean;
}

@Component({
  selector: 'app-admins',
  imports: [ReactiveFormsModule, FormsModule, DatePipe],
  templateUrl: './admins.html',
  styleUrl: './admins.css'
})
export class Admins {
  private readonly api = inject(SuperAdminAdminsService);
  private readonly fb = inject(FormBuilder);

  readonly allPermissions = ALL_PERMISSIONS;
  readonly admins = signal<AdminUserDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly showCreateForm = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly editingId = signal<string | null>(null);
  readonly editDraft = signal<PermissionsDraft>({ ManageProducts: false, ConfirmOrders: false, isActive: true });
  readonly savingEdit = signal(false);
  readonly editError = signal<string | null>(null);

  readonly deactivatingId = signal<string | null>(null);
  readonly rowError = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
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

  toggleCreateForm(): void {
    this.showCreateForm.update((v) => !v);
    this.createError.set(null);
    this.createForm.reset({ username: '', password: '', manageProducts: false, confirmOrders: false });
  }

  submitCreate(): void {
    if (this.createForm.invalid || this.creating()) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { username, password, manageProducts, confirmOrders } = this.createForm.getRawValue();
    const permissions: AdminPermission[] = [
      ...(manageProducts ? (['ManageProducts'] as const) : []),
      ...(confirmOrders ? (['ConfirmOrders'] as const) : [])
    ];

    this.creating.set(true);
    this.createError.set(null);
    this.api
      .create({ username, password, permissions })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (admin) => {
          this.admins.update((list) => [...list, admin]);
          this.showCreateForm.set(false);
        },
        error: (err) => this.createError.set(extractApiErrorMessage(err, 'Could not create admin.'))
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
          this.admins.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
          this.editingId.set(null);
        },
        error: (err) => this.editError.set(extractApiErrorMessage(err, 'Could not save changes.'))
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
}
