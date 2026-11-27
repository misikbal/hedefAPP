import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { FocusSession, GoalSummary, Penalty, TodayResponse } from '@takip/shared';
import { api } from '@/api/client';
import { keys } from '@/api/hooks';
import { queryClient } from '@/api/queryClient';
import { focusNow } from '@/store/focusStore';
import {
  PANEL_MAX_PENALTIES,
  buildFocusPanelModel,
  panelText,
  type FocusPanelModel,
} from './focusPanelModel';
import { SUPPORTED, ensurePermission } from './local';

/**
 * Odak seansı açıkken bildirim çekmecesinde duran kalıcı panel.
 *
 * Android'de yerel modül `modules/focus-panel` varsa (development build / APK): canlı geri sayım,
 * genişleyince seans ilerlemesi, hedefler (çubuklu), açık cezalar ve Duraklat/Devam düğmesi.
 * Modül yoksa (Expo Go, iOS) expo-notifications ile düz metin; orada canlı sayaç yok, bitiş saati var.
 * Düğme `takip://focus?panel=toggle&s=<id>:<durum>` açar; Odak sekmesi işler.
 */
export const FOCUS_PANEL_ID = 'focus-panel';
export const FOCUS_PANEL_KIND = 'focus_panel';
const CHANNEL_ID = 'focus_panel';

interface FocusPanelNative {
  show(model: FocusPanelModel): boolean;
  hide(): void;
}
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<FocusPanelNative>('FocusPanel') : null;

let channelReady: Promise<void> | null = null;
function ensurePanelChannel(): Promise<void> {
  channelReady ??= (async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Odak paneli',
      importance: Notifications.AndroidImportance.LOW,
      description: 'Odak sırasında kalan süre, hedefler ve cezalar',
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    }).catch(() => undefined);
  })();
  return channelReady;
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
        queryKey: keys.penaltyList('open', PANEL_MAX_PENALTIES + 1),
        queryFn: () => api<Penalty[]>(`/penalties?status=open&limit=${PANEL_MAX_PENALTIES + 1}`),
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
  const model = buildFocusPanelModel(s, ctx.goals, ctx.penalties, focusNow(), Date.now());
  if (native) {
    try {
      if (native.show(model)) {
        // önceki sürümün düz metin paneli kaldıysa kaldır
        await Notifications.dismissNotificationAsync(FOCUS_PANEL_ID).catch(() => undefined);
        return;
      }
    } catch {
      // yerel panel çizilemedi; düz metne düş
    }
  }
  const { title, body } = panelText(model);
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
  try {
    native?.hide();
  } catch {
    // modül yok ya da bildirim zaten kalkmış
  }
  await Notifications.dismissNotificationAsync(FOCUS_PANEL_ID).catch(() => undefined);
}
