import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AdminPermission } from './auth.models';

/** Blocks any admin-area route unless a valid (non-expired) session is present. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

/**
 * Blocks a route unless the signed-in admin holds `permission` — the Super Admin always
 * passes, matching the backend's own authorization rule (BACKEND-README.md §2).
 */
export function permissionGuard(permission: AdminPermission): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
    if (auth.hasPermission(permission)) return true;
    return router.createUrlTree(['/dashboard']);
  };
}

/** Blocks a route unless the signed-in admin is the Super Admin. */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (auth.isSuperAdmin()) return true;
  return router.createUrlTree(['/dashboard']);
};

/** Keeps a signed-in admin off the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/dashboard']);
};
