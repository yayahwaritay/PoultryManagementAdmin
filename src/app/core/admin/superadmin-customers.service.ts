import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CustomerDetailDto, CustomerDto, CustomerFilter, UpdateCustomerRequest } from './admin.models';

/** GET/PUT /api/superadmin/customers — requires the `SuperAdmin` role. */
@Injectable({ providedIn: 'root' })
export class SuperAdminCustomersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/superadmin/customers`;

  /** Newest first, not paginated. `search` matches name, email or phone. */
  list(filter: CustomerFilter = {}): Observable<CustomerDto[]> {
    let params = new HttpParams();
    if (filter.search?.trim()) params = params.set('search', filter.search.trim());
    if (filter.isActive !== undefined && filter.isActive !== null) {
      params = params.set('isActive', String(filter.isActive));
    }
    return this.http.get<CustomerDto[]>(this.base, { params });
  }

  /** Includes the customer's full order history, newest first. */
  get(id: string): Observable<CustomerDetailDto> {
    return this.http.get<CustomerDetailDto>(`${this.base}/${id}`);
  }

  /**
   * Send only changed fields. If any value actually changes the customer is emailed a summary
   * (to both the old and new address on an email change).
   */
  update(id: string, payload: UpdateCustomerRequest): Observable<CustomerDetailDto> {
    return this.http.put<CustomerDetailDto>(`${this.base}/${id}`, payload);
  }

  /**
   * Emails the customer a new temporary password (24-hour expiry) and invalidates their old one
   * immediately. The password is never returned. 400 if the account is deactivated.
   */
  resetPassword(id: string): Observable<CustomerDetailDto> {
    return this.http.post<CustomerDetailDto>(`${this.base}/${id}/reset-password`, null);
  }
}
