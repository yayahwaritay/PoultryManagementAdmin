import { environment } from '../../environments/environment';

/**
 * The backend's origin, derived from `environment.apiUrl` by dropping the trailing `/api`
 * (e.g. `https://poultrymanagementapi.onrender.com`). Empty when apiUrl is relative, so paths
 * stay relative and keep working behind a same-origin proxy.
 */
const API_ORIGIN = environment.apiUrl.replace(/\/api\/?$/, '');

/**
 * Resolves a server-relative file path such as `imagePath` (`/uploads/products/<guid>.jpg`) to
 * a URL on the API host. The admin app is deployed separately from the API, so a bare `/uploads/...`
 * would otherwise be requested from the admin site's own origin. Absolute, data: and blob: URLs
 * are returned unchanged.
 */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
