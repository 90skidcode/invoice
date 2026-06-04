import { useAuthStore } from '@/stores/auth-store';

const BASE_URL = import.meta.env['VITE_API_URL'] || '/v1';

function getToken(): string | null {
  return localStorage.getItem('counter_access_token');
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const deviceId = localStorage.getItem('counter_device_id');
  if (deviceId) headers['X-Device-Id'] = deviceId;

  const orgId = localStorage.getItem('counter_org_id');
  if (orgId) headers['X-Org-Id'] = orgId;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    const err = new Error('Unauthorized') as Error & {
      code: string | undefined;
      status: number;
    };
    err.code = 'UNAUTHORIZED';
    err.status = 401;
    throw err;
  }

  const data = (await res.json()) as {
    ok: boolean;
    data?: T;
    error?: { code: string; message: string };
  };

  if (!data.ok) {
    const err = new Error(data.error?.message ?? 'API Error') as Error & {
      code: string | undefined;
      status: number;
    };
    err.code = data.error?.code;
    err.status = res.status;
    throw err;
  }

  return data.data as T;
}

/** Fetch a non-JSON (text/html) response with auth — for printable invoices. */
async function fetchText(path: string): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const orgId = localStorage.getItem('counter_org_id');
  if (orgId) headers['X-Org-Id'] = orgId;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.text();
}

export const api = {
  get: <T>(path: string) => fetchApi<T>(path),
  getText: (path: string) => fetchText(path),
  post: <T>(path: string, body: unknown) =>
    fetchApi<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown, rowVersion?: number) =>
    fetchApi<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...(rowVersion !== undefined ? { headers: { 'If-Match': String(rowVersion) } } : {}),
    }),
  delete: <T>(path: string) => fetchApi<T>(path, { method: 'DELETE' }),
};
