export const AUTH_TOKEN_KEY = 'clayrag_auth_token';

/**
 * Base URL for the Python Agentic RAG backend.
 * - Locally with Vite dev server: empty string (''), proxied via vite.config.ts to localhost:3001.
 * - On Vercel production: set VITE_API_BASE_URL=https://<your-render-service>.onrender.com
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(
  /\/+$/,
  ''
);

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalized}` : normalized;
}

export const USE_COOKIE_CREDENTIALS =
  !API_BASE_URL ||
  String(import.meta.env.VITE_USE_COOKIE_AUTH || '').toLowerCase() === 'true';

export function getStoredAuthToken(): string | null {
  if (USE_COOKIE_CREDENTIALS) {
    return null;
  }
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredAuthToken(token: string | null) {
  if (USE_COOKIE_CREDENTIALS || !token) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } else {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

export function getAuthFetchCredentials(): RequestCredentials | undefined {
  return USE_COOKIE_CREDENTIALS ? 'include' : undefined;
}

export async function authFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = getStoredAuthToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const credentials = init.credentials ?? getAuthFetchCredentials();
  return fetch(apiUrl(input), {
    ...init,
    headers,
    ...(credentials ? { credentials } : {}),
  });
}
