import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Cross-field validator: `newPassword` and `confirmPassword` must match. */
export function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword ? { mismatch: true } : null;
}
