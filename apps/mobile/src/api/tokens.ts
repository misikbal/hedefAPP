import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenPair } from '@takip/shared';

const KEY = 'takip.tokens';
let cache: TokenPair | null | undefined;

/**
 * Telefonda SecureStore. Web'de (yalnızca geliştirme için) SecureStore çalışmadığından
 * localStorage kullanılır.
 */
const store =
  Platform.OS === 'web'
    ? {
        get: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
        set: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
        remove: async (k: string) => globalThis.localStorage?.removeItem(k),
      }
    : {
        get: (k: string) => SecureStore.getItemAsync(k),
        set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
        remove: (k: string) => SecureStore.deleteItemAsync(k),
      };

export async function loadTokens(): Promise<TokenPair | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await store.get(KEY);
    cache = raw ? (JSON.parse(raw) as TokenPair) : null;
  } catch {
    cache = null;
  }
  return cache;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  cache = tokens;
  await store.set(KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  cache = null;
  await store.remove(KEY);
}
