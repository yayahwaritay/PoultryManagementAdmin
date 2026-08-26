/** The two independently-grantable admin permissions the backend recognizes. */
export type AdminPermission = 'ManageProducts' | 'ConfirmOrders';

/** POST /api/auth/login request body. */
export interface AdminLoginRequest {
  username: string;
  password: string;
}

/** POST /api/auth/login 200 response — also what a restored session looks like. */
export interface AdminAuthResponse {
  token: string;
  expiresAt: string;
  adminId: string;
  username: string;
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
}
