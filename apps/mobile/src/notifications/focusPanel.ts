import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  APP_TIMEZONE,
  UNIT_LABELS,
  focusRemainingMs,
  formatNumber,
  localTimeOf,
  type FocusSession,
  type GoalSummary,
  type Penalty,
  type TodayResponse,
} from '@takip/shared';
import { api } from '@/api/client';
import { keys } from '@/api/hooks';
import { queryClient } from '@/api/queryClient';
import { focusNow } from '@/store/focusStore';
import { SUPPORTED, ensurePermission } from './local';

/**
 * Odak seansı açıkken bildirim çekmecesinde duran kalıcı panel (Android'de kaydırılarak
 * kapatılamaz). Seansın bitiş saati, bugünün hedefleri ve açık cezalar görünür.
 * Aynı kimlikle yeniden gösterildiğinde eskisinin yerine geçer; titreşim/ses yok.
 *
 * Not: expo-notifications canlı geri sayım (chronometer) desteklemez; bu yüzden panel
 * kalan süre yerine bitiş saatini gösterir ve her durum değişiminde yenilenir.
 */
export const FOCUS_PANEL_ID = 'focus-panel';
export const FOCUS_PANEL_KIND = 'focus_panel';
const CHANNEL_ID = 'focus_panel';
const MAX_GOALS = 4;
const MAX_PENALTIES = 3;

let channelReady: Promise<void> | null = null;
function ensurePanelChannel(): Promise<void> {
  channelReady ??= (async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Odak paneli',
      importance: Notifications.AndroidImportance.LOW,
      description: 'Odak sırasında hedefler ve cezalar',
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    }).catch(() => undefined);
  })();
  return channelReady;
}

const hhmm = (d: Date) => localTimeOf(d, APP_TIMEZONE);

function goalLine(g: GoalSummary): string {
  const mark = g.status === 'done' ? '✓' : '•';
  return `${mark} ${g.name}: ${formatNumber(g.current)}/${formatNumber(g.target)} ${UNIT_LABELS[g.unit]}`;
}

function penaltyLine(p: Penalty): string {
  return `! ${p.text} · ${hhmm(new Date(p.dueAt))}'e kadar`;
}

/** Panel metni (saf; test edilebilir). */
export function buildFocusPanel(
  s: FocusSession,
  goals: GoalSummary[],
  penalties: Penalty[],
  now: number,
): { title: string; body: string } {
  const label = s.label.trim() || 'Odak';
  const head =
    s.status === 'paused'
      ? `Duraklatıldı · ${Math.ceil(focusRemainingMs(s, now) / 60_000)} dk kaldı`
      : `Bitiş ${hhmm(new Date(Date.now() + focusRemainingMs(s, now)))} · ${s.plannedMinutes} dk`;

  const open = goals.filter((g) => g.status !== 'done');
  const shown = [...open, ...goals.filter((g) => g.status === 'done')].slice(0, MAX_GOALS);
  const lines = [head];
  if (shown.length) {
    lines.push('', `Hedefler (${goals.length - open.length}/${goals.length} tamam)`);
    lines.push(...shown.map(goalLine));
  }
  if (penalties.length) {
    lines.push('', `Cezalar (${penalties.length})`);
    lines.push(...penalties.slice(0, MAX_PENALTIES).map(penaltyLine));
  }
  return { title: `${s.status === 'paused' ? 'Odak duraklatıldı' : 'Odaktasın'} — ${label}`, body: lines.join('\n') };
}

async function loadContext(): Promise<{ goals: GoalSummary[]; penalties: Penalty[] }> {
  const [today, penalties] = await Promise.all([
    queryClient
      .fetchQuery({
        queryKey: keys.today,
        queryFn: () => api<TodayResponse>('/today'),
        staleTime: 30_000,
      })
      .catch(() => queryClient.getQueryData<TodayResponse>(keys.today) ?? null),
    queryClient
      .fetchQuery({
        queryKey: keys.penaltyList('open', MAX_PENALTIES),
        queryFn: () => api<Penalty[]>(`/penalties?status=open&limit=${MAX_PENALTIES}`),
        staleTime: 30_000,
      })
      .catch(() => [] as Penalty[]),
  ]);
  return { goals: today?.goals ?? [], penalties };
}

let seq = 0;

/** Açık seans varsa paneli gösterir/yeniler, yoksa kaldırır. */
export async function updateFocusPanel(s: FocusSession | null): Promise<void> {
  if (!SUPPORTED) return;
  const mine = ++seq;
  if (!s || (s.status !== 'running' && s.status !== 'paused')) {
    await hideFocusPanel();
    return;
  }
  if (!(await ensurePermission())) return;
  await ensurePanelChannel();
  const ctx = await loadContext();
  // Bu arada yeni bir durum geldiyse eski içeriği yazma.
  if (mine !== seq) return;
  const { title, body } = buildFocusPanel(s, ctx.goals, ctx.penalties, focusNow());
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: FOCUS_PANEL_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        data: { url: '/focus', kind: FOCUS_PANEL_KIND },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch {
    // izin geri alındı ya da sistem reddetti
  }
}

export async function hideFocusPanel(): Promise<void> {
  if (!SUPPORTED) return;
  seq++;
  await Notifications.dismissNotificationAsync(FOCUS_PANEL_ID).catch(() => undefined);
}
