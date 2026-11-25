import * as Haptics from 'expo-haptics';
import {
  BACKGROUND_INTERRUPT_MS,
  FOCUS_BREAK_MINUTES,
  focusRemainingMs,
  type FocusFinish,
  type FocusFinishResponse,
  type FocusSession,
  type FocusStart,
} from '@takip/shared';
import { ApiError, api } from '@/api/client';
import { keys } from '@/api/hooks';
import { queryClient } from '@/api/queryClient';
import { cancelLocal, scheduleLocal } from '@/notifications/local';
import { focusNow, resetFocusDevice, setFocus, useFocusStore } from '@/store/focusStore';

/**
 * Odak seansı eylemleri. Bileşenlerden, AppState dinleyicisinden ve çıkıştan çağrılır;
 * bu yüzden hook değil, düz fonksiyon. Sunucu yanıtı her zaman cihaz durumunun yerine geçer.
 */

const isOpen = (s: FocusSession) => s.status === 'running' || s.status === 'paused';

function invalidateFocus() {
  void queryClient.invalidateQueries({ queryKey: keys.focus });
  // Odak süresi hedefe yazılır: hedef özetleri ve istatistikler de değişir.
  void queryClient.invalidateQueries({ queryKey: keys.today });
  void queryClient.invalidateQueries({ queryKey: keys.goals });
  void queryClient.invalidateQueries({ queryKey: keys.stats });
  void queryClient.invalidateQueries({ queryKey: keys.journal });
}

async function rescheduleEnd(s: FocusSession | null) {
  const st = useFocusStore.getState();
  await cancelLocal(st.endNotificationId);
  let id: string | null = null;
  if (s && s.status === 'running') {
    const remaining = focusRemainingMs(s, focusNow());
    id = await scheduleLocal(
      new Date(Date.now() + remaining),
      'Zirvedesin',
      `${s.plannedMinutes} dakikalık odak seansı bitti. Kaydetmeyi unutma.`,
      { url: '/focus', kind: 'focus_end' },
    );
  }
  setFocus({ endNotificationId: id });
}

function apply(s: FocusSession | null): FocusSession | null {
  const open = s && isOpen(s) ? s : null;
  setFocus({
    session: open,
    ...(s ? { clockOffsetMs: Date.parse(s.serverNow) - Date.now() } : {}),
  });
  queryClient.setQueryData(keys.focusActive, open);
  return open;
}

/** Sunucudaki açık seansı cihaza yükler (açılışta ve öne gelince). */
export async function syncActive(): Promise<FocusSession | null> {
  const s = await api<FocusSession | null>('/focus/active');
  const open = apply(s);
  await rescheduleEnd(open);
  return open;
}

export async function startFocus(body: FocusStart): Promise<FocusSession> {
  try {
    const s = await api<FocusSession>('/focus/start', { method: 'POST', body });
    setFocus({ lastFinish: null, backgroundAt: null });
    await endBreak();
    apply(s);
    await rescheduleEnd(s);
    invalidateFocus();
    return s;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'FOCUS_ALREADY_OPEN') await syncActive();
    throw e;
  }
}

async function transition(id: string, action: 'pause' | 'resume' | 'abandon') {
  try {
    const s = await api<FocusSession>(`/focus/${id}/${action}`, { method: 'POST' });
    apply(s);
    await rescheduleEnd(isOpen(s) ? s : null);
    if (action === 'abandon') invalidateFocus();
    return s;
  } catch (e) {
    // Sunucu durumu farklıysa (ör. başka cihazdan bitti) cihazı eşitle.
    if (e instanceof ApiError && e.status === 409) await syncActive();
    throw e;
  }
}
export const pauseFocus = (id: string) => transition(id, 'pause');
export const resumeFocus = (id: string) => transition(id, 'resume');
export const abandonFocus = (id: string) => transition(id, 'abandon');

/** İlk çağrı seansı bitirir; sonraki çağrılar yalnızca not ve bölünme sayısını günceller. */
export async function finishFocus(
  id: string,
  body: FocusFinish = {},
): Promise<FocusFinishResponse> {
  const res = await api<FocusFinishResponse>(`/focus/${id}/finish`, { method: 'POST', body });
  const wasOpen = useFocusStore.getState().session?.id === id;
  apply(res.session);
  await rescheduleEnd(null);
  setFocus({ lastFinish: res, backgroundAt: null });
  if (wasOpen) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  invalidateFocus();
  return res;
}

let finishing: Promise<unknown> | null = null;
/** Süre dolmuş ve hâlâ açık seansı otomatik bitirir (tek seferlik). */
export function finishIfDone(): void {
  const s = useFocusStore.getState().session;
  if (!s || s.status !== 'running' || finishing) return;
  if (focusRemainingMs(s, focusNow()) > 0) return;
  finishing = finishFocus(s.id)
    .catch(() => syncActive().catch(() => undefined))
    .finally(() => {
      finishing = null;
    });
}

/** Arka planda geçen süre 10 sn'yi aştıysa seans "bölündü" sayılır (seans sürer). */
export async function reportBackground(backgroundMs: number): Promise<void> {
  const s = useFocusStore.getState().session;
  if (!s || s.status !== 'running' || backgroundMs <= BACKGROUND_INTERRUPT_MS) return;
  try {
    apply(
      await api<FocusSession>(`/focus/${s.id}/interrupt`, {
        method: 'POST',
        body: { backgroundMs: Math.round(backgroundMs) },
      }),
    );
  } catch {
    await syncActive().catch(() => undefined);
  }
}

/** Çıkış yapılırken açık seans `interrupted` olarak biter ve süresi hedefe yazılır. */
export async function endFocusOnLogout(): Promise<void> {
  const st = useFocusStore.getState();
  if (st.session) {
    await api(`/focus/${st.session.id}/interrupt`, { method: 'POST', body: { end: true } }).catch(
      () => undefined,
    );
  }
  await cancelLocal(st.endNotificationId);
  await cancelLocal(st.breakNotificationId);
  resetFocusDevice();
}

/* ---------- mola ---------- */

export async function startBreak(minutes = FOCUS_BREAK_MINUTES): Promise<void> {
  await endBreak();
  const endsAt = Date.now() + minutes * 60_000;
  setFocus({ breakEndsAt: endsAt });
  const id = await scheduleLocal(new Date(endsAt), 'Mola bitti', 'Sıradaki tırmanışa hazırsın.', {
    url: '/focus',
    kind: 'focus_break',
  });
  setFocus({ breakNotificationId: id });
}

export async function endBreak(): Promise<void> {
  await cancelLocal(useFocusStore.getState().breakNotificationId);
  setFocus({ breakEndsAt: null, breakNotificationId: null });
}
