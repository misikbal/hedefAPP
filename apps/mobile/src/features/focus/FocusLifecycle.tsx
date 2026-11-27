import { useEffect } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { keys } from '@/api/hooks';
import { queryClient } from '@/api/queryClient';
import { updateFocusPanel } from '@/notifications/focusPanel';
import { setFocus, useFocusStore } from '@/store/focusStore';
import { finishIfDone, reportBackground, syncActive } from './actions';

/**
 * Oturum açıkken kökte çalışır: açılışta açık seansı geri yükler, arka plan sürelerini ölçer.
 * Arka plandayken uygulama öldürülürse kalıcı `backgroundAt` açılışta aynı kontrolden geçer.
 */
async function checkBackground() {
  const { backgroundAt } = useFocusStore.getState();
  if (backgroundAt == null) return;
  setFocus({ backgroundAt: null });
  await reportBackground(Date.now() - backgroundAt);
}

async function restore() {
  try {
    await syncActive();
    await checkBackground();
    finishIfDone();
  } catch {
    // Ağ yoksa cihazdaki son durumla devam edilir; sayaç yine duvar saatinden işler.
  }
}

const KEEP_AWAKE_TAG = 'focus-session';

export function FocusLifecycle() {
  // Sayaç çalışırken ekran kararmaz (her yönde). Mola ve duraklatmada normal uyku süresi geçerli.
  const running = useFocusStore((s) => s.session?.status === 'running');
  useEffect(() => {
    if (!running) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [running]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void restore();
    };
    if (useFocusStore.persist.hasHydrated()) run();
    const unsubHydrate = useFocusStore.persist.onFinishHydration(run);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        const s = useFocusStore.getState().session;
        if (s?.status === 'running' && useFocusStore.getState().backgroundAt == null) {
          setFocus({ backgroundAt: Date.now() });
        }
      } else if (state === 'active') {
        void (async () => {
          await checkBackground();
          await restore();
        })();
      }
    });
    // Seans sürerken hedef ilerlemesi ya da ceza değişirse kalıcı panel yenilenir.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubCache = queryClient.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated' || e.action.type !== 'success') return;
      const root = e.query.queryKey[0];
      if (root !== keys.today[0] && root !== keys.penalties[0]) return;
      if (!useFocusStore.getState().session) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void updateFocusPanel(useFocusStore.getState().session), 1000);
    });
    return () => {
      cancelled = true;
      unsubHydrate();
      sub.remove();
      unsubCache();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
