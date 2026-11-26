import type * as AndroidWidget from 'react-native-android-widget';
import { TODAY_WIDGET_NAME } from './constants';
import type * as Data from './data';
import type * as Render from './render';
import { WIDGET_SUPPORTED } from './support';

/**
 * Uygulama içinden ana ekrandaki bütün "Takip — Bugün" widget'larını yeniler.
 * Widget eklenmemişse paket render'ı hiç çağırmaz (ağa çıkılmaz).
 */
export async function updateTodayWidget(): Promise<void> {
  if (!WIDGET_SUPPORTED) return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const lib = require('react-native-android-widget') as typeof AndroidWidget;
  const { loadWidgetState } = require('./data') as typeof Data;
  const { renderTodayWidget } = require('./render') as typeof Render;
  /* eslint-enable @typescript-eslint/no-require-imports */
  try {
    // Aynı turda birden çok widget varsa veri bir kez çekilir.
    let state: ReturnType<typeof loadWidgetState> | null = null;
    await lib.requestWidgetUpdate({
      widgetName: TODAY_WIDGET_NAME,
      renderWidget: async (info) => renderTodayWidget(await (state ??= loadWidgetState()), info),
    });
  } catch {
    // Widget güncellenemezse uygulama etkilenmez; 30 dk'lık periyodik güncelleme sürer.
  }
}
