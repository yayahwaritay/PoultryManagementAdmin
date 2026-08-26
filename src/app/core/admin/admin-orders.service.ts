import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OrderActionRequest, OrderDto, OrderStatus } from './admin.models';

/** GET /api/admin/orders, POST /:id/confirm|reject — requires the `ConfirmOrders` permission. */
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/orders`;

  list(status?: OrderStatus | ''): Observable<OrderDto[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<OrderDto[]>(this.base, { params });
  }

  get(id: string): Observable<OrderDto> {
    return this.http.get<OrderDto>(`${this.base}/${id}`);
  }

  confirm(id: string, payload: OrderActionRequest = {}): Observable<OrderDto> {
    return this.http.post<OrderDto>(`${this.base}/${id}/confirm`, payload);
  }

  /** Also releases the order's reserved stock back to inventory. */
  reject(id: string, payload: OrderActionRequest = {}): Observable<OrderDto> {
    return this.http.post<OrderDto>(`${this.base}/${id}/reject`, payload);
  }
}
