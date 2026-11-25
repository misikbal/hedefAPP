import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { keys, useSettings } from '@/api/hooks';
import { SUPPORTED } from './local';
import { registerForPush } from './push';
import { rescheduleBlockReminders } from './reminders';

type Data = { url?: string | null; notificationId?: string } | null | undefined;

let lastHandled: string | null = null;

function openFromNotification(response: Notifications.NotificationResponse): void {
  // Soğuk açılışta hem getLastNotificationResponse hem dinleyici aynı yanıtı verebilir.
  const id = `${response.notification.request.identifier}:${response.notification.date}`;
  if (id === lastHandled) return;
  lastHandled = id;
  const data = response.notification.request.content.data as Data;
  if (data?.notificationId) {
    void api(`/notifications/${data.notificationId}/read`, { method: 'POST' }).catch(
      () => undefined,
    );
  }
  if (data?.url) router.push(data.url as Href);
}

/**
 * Oturum açıkken kökte çalışır: push kaydı, bildirime dokununca ilgili ekranı açma,
 * blok hatırlatmalarını yeniden planlama (açılışta, ön plana gelince, program değişince).
 */
export function NotificationsLifecycle() {
  const qc = useQueryClient();
  const settings = useSettings();
  const blocksOn = settings.data?.notif.blocks;
  const blocksOnRef = useRef(blocksOn);
  blocksOnRef.current = blocksOn;

  // Push kaydı (oturum başına bir kez; token değişirse yeniden).
  useEffect(() => {
    if (!SUPPORTED) return;
    void registerForPush();
    const sub = Notifications.addPushTokenListener(() => void registerForPush());
    return () => sub.remove();
  }, []);

  // Bildirime dokunma: uygulama kapalıyken açılış dahil.
  useEffect(() => {
    if (!SUPPORTED) return;
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      // Gezinti ağacı hazır olsun diye bir tur beklenir.
      setTimeout(() => openFromNotification(last), 0);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    // Ön plandayken gelen push: liste ve sayaç tazelensin.
    const recv = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: keys.notifications });
    });
    return () => {
      sub.remove();
      recv.remove();
    };
  }, [qc]);

  // Ayar yüklenince ve değişince hatırlatmaları kur.
  useEffect(() => {
    if (!SUPPORTED || blocksOn === undefined) return;
    void rescheduleBlockReminders(blocksOn).catch(() => undefined);
  }, [blocksOn]);

  // Program değişince (blok ekle/düzenle/sil, işaretle, atla) ve ön plana gelince.
  useEffect(() => {
    if (!SUPPORTED) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (blocksOnRef.current === undefined) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void rescheduleBlockReminders(blocksOnRef.current ?? true).catch(() => undefined);
      }, 1500);
    };
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.mutation.state.status === 'success') schedule();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        schedule();
        void qc.invalidateQueries({ queryKey: keys.unread });
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
      app.remove();
    };
  }, [qc]);

  return null;
}
