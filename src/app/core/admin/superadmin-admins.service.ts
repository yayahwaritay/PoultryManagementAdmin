import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUserDto, CreateAdminRequest, UpdateAdminPermissionsRequest } from './admin.models';

/** GET/POST/PUT/DELETE /api/superadmin/admins — requires the `SuperAdmin` role. */
@Injectable({ providedIn: 'root' })
export class SuperAdminAdminsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/superadmin/admins`;

  list(): Observable<AdminUserDto[]> {
    return this.http.get<AdminUserDto[]>(this.base);
  }

  create(payload: CreateAdminRequest): Observable<AdminUserDto> {
    return this.http.post<AdminUserDto>(this.base, payload);
  }

  updatePermissions(id: string, payload: UpdateAdminPermissionsRequest): Observable<AdminUserDto> {
    return this.http.put<AdminUserDto>(`${this.base}/${id}/permissions`, payload);
  }

  /** Deactivates (soft-delete). The Super Admin itself can never be targeted (backend returns 400). */
  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
