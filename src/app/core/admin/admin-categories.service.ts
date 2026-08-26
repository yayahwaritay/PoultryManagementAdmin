import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CategoryDto, CreateCategoryRequest, UpdateCategoryRequest } from './admin.models';

/** GET/POST/PUT/DELETE /api/admin/categories — requires the `ManageProducts` permission. */
@Injectable({ providedIn: 'root' })
export class AdminCategoriesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/categories`;

  list(): Observable<CategoryDto[]> {
    return this.http.get<CategoryDto[]>(this.base);
  }

  get(id: string): Observable<CategoryDto> {
    return this.http.get<CategoryDto>(`${this.base}/${id}`);
  }

  create(payload: CreateCategoryRequest): Observable<CategoryDto> {
    return this.http.post<CategoryDto>(this.base, payload);
  }

  update(id: string, payload: UpdateCategoryRequest): Observable<CategoryDto> {
    return this.http.put<CategoryDto>(`${this.base}/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
