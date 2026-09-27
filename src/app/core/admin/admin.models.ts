import { AdminPermission } from '../auth/auth.models';

// ---------------------------------------------------------------------------
// Categories — GET/POST/PUT/DELETE /api/admin/categories (require ManageProducts)
// ---------------------------------------------------------------------------

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string | null;
}

export interface UpdateCategoryRequest {
  name: string;
  description?: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Products — GET/POST/PUT/DELETE /api/admin/products (require ManageProducts)
// ---------------------------------------------------------------------------

export interface ProductDto {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  priceCents: number;
  quantityInStock: number;
  imagePath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface ProductListResult {
  items: ProductDto[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Fields for the `multipart/form-data` create/update product requests. */
export interface ProductFormValue {
  name: string;
  description?: string | null;
  categoryId: string;
  priceCents: number;
  quantityInStock: number;
  image?: File | null;
  /** Only meaningful on update. */
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Orders — GET /api/admin/orders, /:id, POST /:id/confirm|reject (require ConfirmOrders)
// ---------------------------------------------------------------------------

export type OrderStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled';

export interface OrderItemDto {
  productId: string;
  productNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  subtotalCents: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  /** `null` on legacy orders — no confirm/reject email is sent for those. */
  customerEmail: string | null;
  deliveryAddress: string;
  status: OrderStatus;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  createdAt: string;
  confirmedAt: string | null;
  confirmedByAdminUsername: string | null;
  adminNotes: string | null;
  items: OrderItemDto[];
}

export interface OrderActionRequest {
  adminNotes?: string | null;
}

// ---------------------------------------------------------------------------
// Transactions — GET /api/admin/transactions[/summary], POST /:id/reconcile (require ConfirmOrders)
// ---------------------------------------------------------------------------

export type TransactionStatus = 'Pending' | 'Success' | 'Failed' | 'Reconciled';

/** Free-text on the backend today (BACKEND-README.md §7) — these are just the seeded values. */
export type TransactionProvider = 'OrangeMoney' | 'Afrimoney' | 'QMoney' | 'Cash' | string;

export interface TransactionDto {
  id: string;
  orderId: string;
  orderNumber: string;
  reference: string;
  provider: TransactionProvider;
  amountCents: number;
  status: TransactionStatus;
  createdAt: string;
  reconciledAt: string | null;
  reconciledByAdminUsername: string | null;
  notes: string | null;
}

export interface TransactionSummaryDto {
  totalCount: number;
  totalAmountCents: number;
  countByStatus: Record<string, number>;
  amountByStatus: Record<string, number>;
  countByProvider: Record<string, number>;
  amountByProvider: Record<string, number>;
}

export interface ReconcileTransactionRequest {
  status: Extract<TransactionStatus, 'Reconciled' | 'Failed'>;
  notes?: string | null;
}

export interface TransactionFilter {
  status?: TransactionStatus | '';
  provider?: string;
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Super Admin — /api/superadmin/admins (require SuperAdmin)
// ---------------------------------------------------------------------------

export interface AdminUserDto {
  id: string;
  username: string;
  /** `null` for older and seeded accounts — they receive no emails until one is set. */
  email: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  permissions: AdminPermission[];
  /** True until the admin replaces their emailed default password. */
  mustChangePassword?: boolean;
  /** When the emailed default password stops working; `null` once they've set their own. */
  defaultPasswordExpiresAt?: string | null;
  createdAt: string;
}

/**
 * `password` is optional — leave it out and the server generates one and emails it to `email`.
 * Either way it is a default password that must be changed on first login within 24 hours.
 */
export interface CreateAdminRequest {
  username: string;
  email: string;
  password?: string;
  permissions: AdminPermission[];
}

export interface UpdateAdminPermissionsRequest {
  permissions: AdminPermission[];
  isActive: boolean;
  /** Replaces the email when present; left unchanged when omitted. */
  email?: string;
}

export interface UpdateAdminEmailRequest {
  email: string;
}

// ---------------------------------------------------------------------------
// Super Admin — /api/superadmin/customers (require SuperAdmin)
// ---------------------------------------------------------------------------

export interface CustomerDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
  /** True after a Super Admin reset, until the customer chooses their own password. */
  mustChangePassword?: boolean;
  /** When the emailed temporary password stops working; `null` when none is outstanding. */
  temporaryPasswordExpiresAt?: string | null;
  createdAt: string;
  /** Every order the customer has placed, any status. */
  orderCount: number;
  /** Order totals excluding Rejected and Cancelled orders, in cents. */
  totalSpentCents: number;
}

export interface CustomerOrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
}

export interface CustomerDetailDto extends CustomerDto {
  orders: CustomerOrderSummaryDto[];
}

export interface CustomerFilter {
  search?: string;
  isActive?: boolean | null;
}

/** Every field optional — send only what changed. Blank values are ignored server-side. */
export interface UpdateCustomerRequest {
  fullName?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
}
