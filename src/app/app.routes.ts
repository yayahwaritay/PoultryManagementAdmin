import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, superAdminGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard)
      },
      {
        path: 'products',
        canActivate: [permissionGuard('ManageProducts')],
        loadComponent: () => import('./pages/products/products').then((m) => m.Products)
      },
      {
        path: 'categories',
        canActivate: [permissionGuard('ManageProducts')],
        loadComponent: () => import('./pages/categories/categories').then((m) => m.Categories)
      },
      {
        path: 'orders',
        canActivate: [permissionGuard('ConfirmOrders')],
        loadComponent: () => import('./pages/orders/orders').then((m) => m.Orders)
      },
      {
        path: 'transactions',
        canActivate: [permissionGuard('ConfirmOrders')],
        loadComponent: () =>
          import('./pages/transactions/transactions').then((m) => m.Transactions)
      },
      {
        path: 'admins',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./pages/admins/admins').then((m) => m.Admins)
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
