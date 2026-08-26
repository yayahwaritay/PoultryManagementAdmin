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
  customerEmail: string;
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
  isSuperAdmin: boolean;
  isActive: boolean;
  permissions: AdminPermission[];
  createdAt: string;
}

export interface CreateAdminRequest {
  username: string;
  password: string;
  permissions: AdminPermission[];
}

export interface UpdateAdminPermissionsRequest {
  permissions: AdminPermission[];
  isActive: boolean;
}
