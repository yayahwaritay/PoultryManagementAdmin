import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { passwordsMatch } from '../../core/auth/password.validators';
import { extractApiErrorCode, extractApiErrorMessage, extractFieldErrors } from '../../core/api-error';

const DEFAULT_PASSWORD_EXPIRED = 'DefaultPasswordExpired';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly pending = this.auth.pendingPasswordChange;
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Set when the default password expired — the only fix is a Super Admin reset, so no retry. */
  readonly expired = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    },
    { validators: passwordsMatch }
  );

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.expired.set(false);

    this.auth
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (res) => {
          if (res.mustChangePassword) {
            this.passwordForm.reset();
            return;
          }
          this.router.navigateByUrl('/dashboard');
        },
        error: (err) => this.handleError(err, 'Invalid username or password.')
      });
  }

  submitNewPassword(): void {
    const pending = this.pending();
    if (!pending || this.submitting()) return;
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { newPassword } = this.passwordForm.getRawValue();
    if (newPassword === pending.currentPassword) {
      this.errorMessage.set('New password must be different from the current password.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.auth
      .changePassword({ currentPassword: pending.currentPassword, newPassword })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigateByUrl('/dashboard'),
        error: (err) => {
          if (extractApiErrorCode(err) === DEFAULT_PASSWORD_EXPIRED) {
            this.auth.cancelPendingPasswordChange();
            this.form.controls.password.reset();
          }
          const fieldError = extractFieldErrors(err)['newPassword'];
          this.handleError(err, 'Could not set your password.', fieldError);
        }
      });
  }

  backToSignIn(): void {
    this.auth.cancelPendingPasswordChange();
    this.form.controls.password.reset();
    this.errorMessage.set(null);
  }

  private handleError(err: unknown, fallback: string, override?: string): void {
    this.expired.set(extractApiErrorCode(err) === DEFAULT_PASSWORD_EXPIRED);
    this.errorMessage.set(override ?? extractApiErrorMessage(err, fallback));
  }
}
