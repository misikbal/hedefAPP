import type * as AndroidWidget from 'react-native-android-widget';
import { WIDGET_SUPPORTED } from './support';
import type * as TaskHandler from './taskHandler';

/**
 * Headless görev, uygulama paketi yüklenirken eşzamanlı kaydedilmeli (`index.ts`).
 * Expo Go'da paket hiç yüklenmez.
 */
export function registerWidget(): void {
  if (!WIDGET_SUPPORTED) return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const lib = require('react-native-android-widget') as typeof AndroidWidget;
  const { widgetTaskHandler } = require('./taskHandler') as typeof TaskHandler;
  /* eslint-enable @typescript-eslint/no-require-imports */
  lib.registerWidgetTaskHandler(widgetTaskHandler);
}
