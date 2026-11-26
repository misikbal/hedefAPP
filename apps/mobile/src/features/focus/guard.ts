import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { z } from 'zod';
import { focusRemainingMs, type FocusSession } from '@takip/shared';
import { focusNow } from '@/store/focusStore';
import { SOCIAL_PACKAGES, setGuard, useGuardStore, type GuardMode } from '@/store/guardStore';

/**
 * Odak engeli: yerel Expo modülü `modules/focus-guard` (Android erişilebilirlik hizmeti).
 * Modül yoksa (web, iOS, Expo Go, eski build) her şey no-op ve `isGuardSupported()` false.
 */

interface NativeGuardOptions {
  sessionId: string;
  until: number;
  mode: GuardMode;
  blocked: string[];
  allowed: string[];
  blockSettings: boolean;
}

interface FocusGuardNative {
  isServiceEnabled(): boolean;
  openAccessibilitySettings(): void;
  openAppDetails(): void;
  getAppLabel(pkg: string): unknown;
  listLaunchableApps(withIcons: boolean): Promise<unknown>;
  startGuard(options: NativeGuardOptions): void;
  stopGuard(): void;
  getGuardStatus(): unknown;
}

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<FocusGuardNative>('FocusGuard') : null;

/** Unutulan seans politikası (sunucu 6 saatte `abandoned` yapar) */
const PAUSE_GUARD_MS = 6 * 60 * 60_000;
/** Bitişten sonra kısa pay: otomatik bitirme gecikirse engel erken kalkmasın */
const END_GRACE_MS = 60_000;

const appSchema = z.object({
  packageName: z.string().min(1),
  label: z.string(),
  icon: z.string().nullish(),
});
export type LaunchableApp = z.infer<typeof appSchema>;

const statusSchema = z.object({
  active: z.boolean(),
  until: z.number(),
  mode: z.string().nullish(),
  sessionId: z.string().nullish(),
  attempts: z.number().int().nonnegative(),
  lastBlocked: z.string().nullish(),
  lastBlockedAt: z.number().nullish(),
});
export interface GuardStatus {
  active: boolean;
  until: number;
  attempts: number;
  lastBlocked: string | null;
}

const INACTIVE: GuardStatus = { active: false, until: 0, attempts: 0, lastBlocked: null };

export const isGuardSupported = (): boolean => native != null;

/** Android 13+ sideload uygulamalarda erişilebilirlik izni "Kısıtlı ayar" arkasındadır. */
export const needsRestrictedSettingStep = (): boolean =>
  Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;

export function isServiceEnabled(): boolean {
  try {
    return native?.isServiceEnabled() === true;
  } catch {
    return false;
  }
}

export function openAccessibilitySettings(): void {
  native?.openAccessibilitySettings();
}

export function openAppDetails(): void {
  native?.openAppDetails();
}

export function getAppLabel(pkg: string): string | null {
  if (!native) return null;
  try {
    const r = z.string().nullish().safeParse(native.getAppLabel(pkg));
    return r.success ? (r.data ?? null) : null;
  } catch {
    return null;
  }
}

export async function listLaunchableApps(withIcons = true): Promise<LaunchableApp[]> {
  if (!native) return [];
  const r = z.array(appSchema).safeParse(await native.listLaunchableApps(withIcons));
  return r.success ? r.data : [];
}

export function getGuardStatus(): GuardStatus {
  if (!native) return INACTIVE;
  try {
    const r = statusSchema.safeParse(native.getGuardStatus());
    if (!r.success) return INACTIVE;
    return {
      active: r.data.active,
      until: r.data.until,
      attempts: r.data.attempts,
      lastBlocked: r.data.lastBlocked ?? null,
    };
  } catch {
    return INACTIVE;
  }
}

export function stopGuard(): void {
  try {
    native?.stopGuard();
  } catch {
    // Modül yoksa yapılacak bir şey yok.
  }
}

/** Varsayılan engel listesi: bilinen sosyal medya uygulamalarından cihazda kurulu olanlar (bir kez). */
export async function ensureGuardDefaults(): Promise<void> {
  if (!native || useGuardStore.getState().initialized) return;
  const apps = await listLaunchableApps(false);
  if (!apps.length) return;
  const installed = new Set(apps.map((a) => a.packageName));
  const st = useGuardStore.getState();
  if (st.initialized) return;
  setGuard({ initialized: true, blocked: st.blocked.filter((p) => installed.has(p)) });
}

/** Ayar/hizmet değişince kullanılır: sosyal medya paketi mi */
export const isSocialPackage = (pkg: string): boolean => SOCIAL_PACKAGES.includes(pkg);

/**
 * Seans durumunu native engele yansıtır. Her seans değişiminde ve ayar değişiminde çağrılır.
 * running → bitiş + 1 dk; paused → (molada da engelle) 6 saat, değilse kapalı; seans yok → kapalı.
 */
export function syncGuard(session: FocusSession | null): void {
  if (!native) return;
  const g = useGuardStore.getState();
  const open = session && (session.status === 'running' || session.status === 'paused');
  if (!g.enabled || !open || !isServiceEnabled()) {
    stopGuard();
    return;
  }
  let until: number;
  if (session.status === 'running') {
    until = Date.now() + focusRemainingMs(session, focusNow()) + END_GRACE_MS;
  } else if (g.blockDuringPause) {
    until = Date.now() + PAUSE_GUARD_MS;
  } else {
    stopGuard();
    return;
  }
  try {
    native.startGuard({
      sessionId: session.id,
      until,
      mode: g.mode,
      blocked: g.blocked,
      allowed: g.allowed,
      blockSettings: g.blockSettings,
    });
  } catch {
    // Native hata seansı bozmamalı.
  }
}
