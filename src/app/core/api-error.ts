import { HttpErrorResponse } from '@angular/common/http';

/** Every backend error response is `{ "message": "..." }` per BACKEND-README.md §3. */
export interface ApiErrorBody {
  message?: string;
}

/** Pulls the backend's `{ message }` out of an HttpErrorResponse, with sane fallbacks. */
export function extractApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiErrorBody | string | null;
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object' && body.message) return body.message;
    if (err.status === 0) return 'Could not reach the server. Check your connection and try again.';
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status === 404) return 'Not found.';
  }
  return fallback;
}
