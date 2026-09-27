/** The two independently-grantable admin permissions the backend recognizes. */
export type AdminPermission = 'ManageProducts' | 'ConfirmOrders';

/** POST /api/auth/login request body. */
export interface AdminLoginRequest {
  username: string;
  password: string;
}

/**
 * POST /api/auth/login and POST /api/auth/change-password 200 response — also what a restored
 * session looks like. When `mustChangePassword` is true the token is restricted: it only works for
 * change-password, so it is never stored as a session (EMAIL-NOTIFICATIONS-README.md §1.2).
 */
export interface AdminAuthResponse {
  token: string;
  expiresAt: string;
  adminId: string;
  username: string;
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
  mustChangePassword?: boolean;
  defaultPasswordExpiresAt?: string | null;
}

/** POST /api/auth/change-password request body. `newPassword` is min 8 chars. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** A sign-in with an emailed default password, held in memory until the admin sets their own. */
export interface PendingPasswordChange {
  token: string;
  username: string;
  currentPassword: string;
  expiresAt: string | null;
}
