import { useEffect } from 'react';
import { AppState } from 'react-native';
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

export function FocusLifecycle() {
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
    return () => {
      cancelled = true;
      unsubHydrate();
      sub.remove();
    };
  }, []);
  return null;
}
