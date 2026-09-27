import { HttpErrorResponse } from '@angular/common/http';

/**
 * Backend error responses are usually `{ "message": "..." }` (BACKEND-README.md §3), but model
 * validation failures use ASP.NET's validation-problem shape instead:
 * `{ "title": "...", "status": 400, "errors": { "Email": ["..."] } }`. Some 403s also carry a `code`.
 */
export interface ApiErrorBody {
  message?: string;
  code?: string;
  title?: string;
  errors?: Record<string, string[]>;
}

function errorBody(err: unknown): ApiErrorBody | null {
  if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object') {
    return err.error as ApiErrorBody;
  }
  return null;
}

/** The backend's machine-readable error `code`, e.g. `DefaultPasswordExpired`. */
export function extractApiErrorCode(err: unknown): string | null {
  return errorBody(err)?.code ?? null;
}

/**
 * Maps a validation-problem `errors` object onto form-field keys, e.g. `{ email: "..." }`.
 * Keys are camel-cased (`Email` → `email`, `NewPassword` → `newPassword`) and only the first
 * message per field is kept. Returns `{}` for any other kind of error.
 */
export function extractFieldErrors(err: unknown): Record<string, string> {
  const errors = errorBody(err)?.errors;
  if (!errors) return {};
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(errors)) {
    if (!messages?.length) continue;
    const field = key.replace(/^\$\.?/, '');
    result[field.charAt(0).toLowerCase() + field.slice(1)] = messages[0];
  }
  return result;
}

/** Pulls the backend's `{ message }` (or first validation error) out of an HttpErrorResponse. */
export function extractApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiErrorBody | string | null;
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object') {
      if (body.message) return body.message;
      const firstFieldError = Object.values(extractFieldErrors(err))[0];
      if (firstFieldError) return firstFieldError;
    }
    if (err.status === 0) return 'Could not reach the server. Check your connection and try again.';
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status === 404) return 'Not found.';
  }
  return fallback;
}
