import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminAuthResponse, AdminLoginRequest, AdminPermission } from './auth.models';

const STORAGE_KEY = 'jolive-admin-auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly session = signal<AdminAuthResponse | null>(this.readStoredSession());

  readonly token = computed(() => this.session()?.token ?? null);
  readonly username = computed(() => this.session()?.username ?? null);
  readonly isSuperAdmin = computed(() => this.session()?.isSuperAdmin ?? false);
  readonly permissions = computed<AdminPermission[]>(() => this.session()?.permissions ?? []);
  readonly isAuthenticated = computed(() => this.session() !== null);

  /** Super Admin implicitly passes every permission check, per BACKEND-README.md §2. */
  hasPermission(permission: AdminPermission): boolean {
    const s = this.session();
    if (!s) return false;
    return s.isSuperAdmin || s.permissions.includes(permission);
  }

  login(payload: AdminLoginRequest): Observable<AdminAuthResponse> {
    return this.http
      .post<AdminAuthResponse>(`${environment.apiUrl}/auth/login`, payload)
      .pipe(tap((res) => this.setSession(res)));
  }

  logout(): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private setSession(res: AdminAuthResponse): void {
    this.session.set(res);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
  }

  private readStoredSession(): AdminAuthResponse | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AdminAuthResponse;
      if (!parsed?.token || !parsed?.expiresAt) return null;
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
