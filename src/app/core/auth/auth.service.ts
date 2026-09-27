import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminAuthResponse,
  AdminLoginRequest,
  AdminPermission,
  ChangePasswordRequest,
  PendingPasswordChange
} from './auth.models';

const STORAGE_KEY = 'jolive-admin-auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly session = signal<AdminAuthResponse | null>(this.readStoredSession());

  /**
   * A sign-in with an emailed default password. Kept in memory only — its token is restricted to
   * POST /api/auth/change-password, so it must never become the stored session.
   */
  readonly pendingPasswordChange = signal<PendingPasswordChange | null>(null);

  readonly token = computed(() => this.session()?.token ?? null);
  readonly adminId = computed(() => this.session()?.adminId ?? null);
  readonly username = computed(() => this.session()?.username ?? null);
  readonly isSuperAdmin = computed(() => this.session()?.isSuperAdmin ?? false);
  readonly permissions = computed<AdminPermission[]>(() => this.session()?.permissions ?? []);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly mustChangePassword = computed(() => this.session()?.mustChangePassword ?? false);

  /** Super Admin implicitly passes every permission check, per BACKEND-README.md §2. */
  hasPermission(permission: AdminPermission): boolean {
    const s = this.session();
    if (!s) return false;
    return s.isSuperAdmin || s.permissions.includes(permission);
  }

  /**
   * Signs in. A normal login is saved as the session; a default-password login
   * (`mustChangePassword: true`) is parked in `pendingPasswordChange` instead.
   */
  login(payload: AdminLoginRequest): Observable<AdminAuthResponse> {
    this.pendingPasswordChange.set(null);
    return this.http.post<AdminAuthResponse>(`${environment.apiUrl}/auth/login`, payload).pipe(
      tap((res) => {
        if (res.mustChangePassword) {
          this.pendingPasswordChange.set({
            token: res.token,
            username: res.username,
            currentPassword: payload.password,
            expiresAt: res.defaultPasswordExpiresAt ?? null
          });
        } else {
          this.setSession(res);
        }
      })
    );
  }

  /**
   * POST /api/auth/change-password. Uses the pending restricted token when there is one,
   * otherwise the signed-in session's token. The 200 response is a full-access login, which
   * replaces the session.
   */
  changePassword(payload: ChangePasswordRequest): Observable<AdminAuthResponse> {
    const pending = this.pendingPasswordChange();
    const headers = pending
      ? new HttpHeaders({ Authorization: `Bearer ${pending.token}` })
      : undefined;
    return this.http
      .post<AdminAuthResponse>(`${environment.apiUrl}/auth/change-password`, payload, { headers })
      .pipe(
        tap((res) => {
          this.pendingPasswordChange.set(null);
          this.setSession(res);
        })
      );
  }

  cancelPendingPasswordChange(): void {
    this.pendingPasswordChange.set(null);
  }

  logout(): void {
    this.session.set(null);
    this.pendingPasswordChange.set(null);
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
      if (!parsed?.token || !parsed?.expiresAt || parsed.mustChangePassword) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
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
