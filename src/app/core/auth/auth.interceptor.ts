import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Attaches the admin's Bearer token to every /api request (unless the request already carries one,
 * e.g. change-password with a restricted token), and signs the admin out on a 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();
  const isApiRequest = req.url.startsWith('/api') || req.url.includes('/api/');
  const authedReq = token && isApiRequest && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err) => {
      if (err?.status === 401 && auth.isAuthenticated()) {
        auth.logout();
        router.navigate(['/login']);
      } else if (err?.status === 403 && auth.mustChangePassword()) {
        // A restricted default-password token can only change the password
        // (EMAIL-NOTIFICATIONS-README.md §1.2) — send the admin back to set one.
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
