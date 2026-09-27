import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { extractApiErrorMessage, extractFieldErrors } from '../../core/api-error';
import { passwordsMatch } from '../../core/auth/password.validators';

/** POST /api/auth/change-password for an already signed-in admin. */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  templateUrl: './change-password.html'
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    },
    { validators: passwordsMatch }
  );

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    if (currentPassword === newPassword) {
      this.errorMessage.set('New password must be different from the current password.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});
    this.auth
      .changePassword({ currentPassword, newPassword })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.form.reset();
          this.toast.success('Your password has been changed.');
        },
        error: (err) => {
          this.fieldErrors.set(extractFieldErrors(err));
          this.errorMessage.set(extractApiErrorMessage(err, 'Could not change your password.'));
        }
      });
  }
}
