import { apiErrorSchema, tokenPairSchema } from '@takip/shared';
import { API_URL } from './config';
import { clearTokens, loadTokens, saveTokens } from './tokens';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();
/** Refresh de başarısız olursa çağrılır (kullanıcı giriş ekranına döner). */
export function onSessionExpired(fn: Listener): () => void {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const parsed = apiErrorSchema.safeParse(await res.json());
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      return new ApiError(res.status, code, message, details);
    }
  } catch {
    // gövde JSON değil
  }
  return new ApiError(res.status, 'HTTP_ERROR', 'Sunucuya ulaşılamadı');
}

let refreshing: Promise<boolean> | null = null;

/** Aynı anda gelen 401'ler tek bir refresh isteğini paylaşır. */
async function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const tokens = await loadTokens();
    if (!tokens) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) return false;
      await saveTokens(tokenPairSchema.parse(await res.json()));
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const tokens = await loadTokens();
    if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.',
    );
  }

  if (res.status === 401 && auth && !retried) {
    if (await refreshTokens()) return api<T>(path, opts, true);
    await clearTokens();
    sessionExpiredListeners.forEach((fn) => fn());
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
