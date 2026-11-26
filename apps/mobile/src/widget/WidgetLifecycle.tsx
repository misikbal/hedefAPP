import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { WIDGET_SUPPORTED } from './support';
import { updateTodayWidget } from './update';

/**
 * Oturum açıkken kökte çalışır: açılışta, ön plana gelince ve her başarılı mutasyondan sonra
 * ana ekran widget'ını yeniler. Çıkışta (bileşen kalkınca, token'lar silinmiş olur) widget
 * "Giriş yap" durumuna döner.
 */
export function WidgetLifecycle() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!WIDGET_SUPPORTED) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void updateTodayWidget();
      }, 1500);
    };
    void updateTodayWidget();
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.mutation.state.status === 'success') schedule();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') schedule();
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
      app.remove();
      void updateTodayWidget();
    };
  }, [qc]);

  return null;
}
