import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { todayResponseSchema } from '@takip/shared';
import { api } from '@/api/client';
import { loadTokens } from '@/api/tokens';
import type { WidgetState } from './model';

/**
 * Widget verisi: uygulamanın kendi `api()` istemcisini kullanır (React'e bağlı değil; 401'de
 * aynı refresh akışı çalışır), bu yüzden headless görevde de çalışır. Son başarılı yanıt
 * AsyncStorage'da tutulur; ağ hatasında o gösterilir.
 */

const CACHE_KEY = 'takip.widget.today';

const cacheSchema = z.object({ fetchedAt: z.string(), today: todayResponseSchema });
type Cache = z.infer<typeof cacheSchema>;

async function readCache(): Promise<Cache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeCache(cache: Cache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // önbellek yazılamazsa widget yine de güncel veriyi gösterir
  }
}

export async function clearWidgetCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // yok say
  }
}

/** Ağa çıkmadan: önbellekteki veri (ilk çizim için) ya da oturum yoksa giriş durumu. */
export async function loadCachedWidgetState(): Promise<WidgetState | null> {
  if (!(await loadTokens())) return { kind: 'signedOut' };
  const cache = await readCache();
  return cache ? { kind: 'data', ...cache, stale: false } : null;
}

/** `GET /today`; başarısızsa son başarılı veri `stale: true` ile döner. */
export async function loadWidgetState(): Promise<WidgetState> {
  if (!(await loadTokens())) {
    await clearWidgetCache();
    return { kind: 'signedOut' };
  }
  try {
    const today = todayResponseSchema.parse(await api<unknown>('/today'));
    const cache: Cache = { fetchedAt: new Date().toISOString(), today };
    await writeCache(cache);
    return { kind: 'data', ...cache, stale: false };
  } catch {
    // Refresh de başarısızsa api() token'ları siler: oturum kapandı demektir.
    if (!(await loadTokens())) {
      await clearWidgetCache();
      return { kind: 'signedOut' };
    }
    const cache = await readCache();
    return cache ? { kind: 'data', ...cache, stale: true } : { kind: 'unavailable' };
  }
}
