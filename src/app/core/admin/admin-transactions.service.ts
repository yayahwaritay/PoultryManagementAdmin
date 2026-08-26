import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ReconcileTransactionRequest,
  TransactionDto,
  TransactionFilter,
  TransactionSummaryDto
} from './admin.models';

/**
 * GET /api/admin/transactions[/summary], POST /:id/reconcile — requires the `ConfirmOrders`
 * permission. Backs the transaction monitoring / reconciliation feature.
 */
@Injectable({ providedIn: 'root' })
export class AdminTransactionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/transactions`;

  list(filter: TransactionFilter = {}): Observable<TransactionDto[]> {
    return this.http.get<TransactionDto[]>(this.base, { params: this.toParams(filter) });
  }

  summary(from?: string, to?: string): Observable<TransactionSummaryDto> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<TransactionSummaryDto>(`${this.base}/summary`, { params });
  }

  reconcile(id: string, payload: ReconcileTransactionRequest): Observable<TransactionDto> {
    return this.http.post<TransactionDto>(`${this.base}/${id}/reconcile`, payload);
  }

  private toParams(filter: TransactionFilter): HttpParams {
    let params = new HttpParams();
    if (filter.status) params = params.set('status', filter.status);
    if (filter.provider) params = params.set('provider', filter.provider);
    if (filter.from) params = params.set('from', filter.from);
    if (filter.to) params = params.set('to', filter.to);
    return params;
  }
}
