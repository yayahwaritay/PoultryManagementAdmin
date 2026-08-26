import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProductDto, ProductFormValue, ProductListResult } from './admin.models';

export interface AdminProductQuery {
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** GET/POST/PUT/DELETE /api/admin/products — requires the `ManageProducts` permission. */
@Injectable({ providedIn: 'root' })
export class AdminProductsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/products`;

  list(query: AdminProductQuery = {}): Observable<ProductListResult> {
    let params = new HttpParams();
    if (query.categoryId) params = params.set('categoryId', query.categoryId);
    if (query.search) params = params.set('search', query.search);
    if (query.page) params = params.set('page', query.page);
    if (query.pageSize) params = params.set('pageSize', query.pageSize);
    return this.http.get<ProductDto[] | ProductListResult>(this.base, { params }).pipe(
      map((res) => this.toListResult(res, query))
    );
  }

  /**
   * The live API currently returns a bare `ProductDto[]` (no pagination envelope, no
   * server-side filtering). Normalize that into `ProductListResult` here — client-side
   * filtered/paginated — so nothing above this service needs to change once the backend
   * grows real pagination and starts returning the envelope directly.
   */
  private toListResult(
    res: ProductDto[] | ProductListResult,
    query: AdminProductQuery
  ): ProductListResult {
    if (!Array.isArray(res)) return res;

    const search = query.search?.trim().toLowerCase();
    const filtered = res.filter((p) => {
      if (query.categoryId && p.categoryId !== query.categoryId) return false;
      if (search && !p.name.toLowerCase().includes(search)) return false;
      return true;
    });

    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : filtered.length || 1;
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      totalCount,
      totalPages
    };
  }

  get(id: string): Observable<ProductDto> {
    return this.http.get<ProductDto>(`${this.base}/${id}`);
  }

  create(payload: ProductFormValue): Observable<ProductDto> {
    return this.http.post<ProductDto>(this.base, this.toFormData(payload));
  }

  update(id: string, payload: ProductFormValue): Observable<ProductDto> {
    return this.http.put<ProductDto>(`${this.base}/${id}`, this.toFormData(payload));
  }

  /** Soft-deletes (sets isActive: false). */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  private toFormData(payload: ProductFormValue): FormData {
    const form = new FormData();
    form.set('Name', payload.name);
    if (payload.description) form.set('Description', payload.description);
    form.set('CategoryId', payload.categoryId);
    form.set('PriceCents', String(payload.priceCents));
    form.set('QuantityInStock', String(payload.quantityInStock));
    if (payload.image) form.set('Image', payload.image, payload.image.name);
    if (payload.isActive !== undefined) form.set('IsActive', String(payload.isActive));
    return form;
  }
}
