/** app.config.ts → react-native-android-widget eklentisindeki `name` ile aynı olmalı. */
export const TODAY_WIDGET_NAME = 'TodayWidget';

/** Widget'tan uygulamaya açılan yollar (expo-router, `scheme: 'takip'`). */
export const WIDGET_URI = {
  today: 'takip:///',
  penalties: 'takip:///penalties',
} as const;

/** Widget içindeki "güncellenemedi" ibaresine dokunma: yeniden dener. */
export const WIDGET_REFRESH_ACTION = 'REFRESH';
