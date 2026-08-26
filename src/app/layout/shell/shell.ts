import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  visible: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.css'
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly username = this.auth.username;
  readonly isSuperAdmin = this.auth.isSuperAdmin;
  readonly roleLabel = computed(() => (this.isSuperAdmin() ? 'Super Admin' : 'Admin'));

  readonly navItems = computed<NavItem[]>(() => [
    { label: 'Dashboard', path: '/dashboard', icon: '▦', visible: true },
    {
      label: 'Products',
      path: '/products',
      icon: '▣',
      visible: this.auth.hasPermission('ManageProducts')
    },
    {
      label: 'Categories',
      path: '/categories',
      icon: '☷',
      visible: this.auth.hasPermission('ManageProducts')
    },
    {
      label: 'Orders',
      path: '/orders',
      icon: '⚑',
      visible: this.auth.hasPermission('ConfirmOrders')
    },
    {
      label: 'Transactions',
      path: '/transactions',
      icon: '⇆',
      visible: this.auth.hasPermission('ConfirmOrders')
    },
    { label: 'Admins', path: '/admins', icon: '★', visible: this.isSuperAdmin() }
  ]);

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
