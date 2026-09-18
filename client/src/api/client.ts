export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export class ApiRequestError extends Error {
  constructor(public readonly status: number, public readonly payload: ApiErrorShape) {
    super(payload.message);
    this.name = 'ApiRequestError';
  }
}

const TOKEN_KEY = 'voucher.token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * The single place the app talks to the network. Every call carries the bearer
 * token; a 401 clears it and bounces to the sign-in screen.
 */
export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData; raw?: boolean } = {},
): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });

  if (response.status === 401) {
    tokenStore.clear();
    if (!location.pathname.startsWith('/login')) location.assign('/login');
  }

  if (options.raw) {
    if (!response.ok) throw new ApiRequestError(response.status, { code: 'ERROR', message: 'Download failed.' });
    return (await response.blob()) as T;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      (payload as { error?: ApiErrorShape })?.error ?? { code: 'ERROR', message: 'Something went wrong.' },
    );
  }
  return payload as T;
}

export async function download(path: string, filename: string): Promise<void> {
  const blob = await request<Blob>(path, { raw: true });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
