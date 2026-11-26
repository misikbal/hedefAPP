import type { WidgetTaskHandler } from 'react-native-android-widget';
import { WIDGET_REFRESH_ACTION } from './constants';
import { loadCachedWidgetState, loadWidgetState } from './data';
import { renderTodayWidget } from './render';

/**
 * Headless görev: widget eklendiğinde, `updatePeriodMillis` dolduğunda (30 dk), boyutu
 * değiştiğinde ve "güncellenemedi"ye dokunulduğunda çalışır. Önce önbellekteki veri anında
 * çizilir, sonra `GET /today` ile yenilenir.
 */
export const widgetTaskHandler: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  clickAction,
  renderWidget,
}) => {
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      break;
    case 'WIDGET_CLICK':
      if (clickAction !== WIDGET_REFRESH_ACTION) return;
      break;
    default:
      return;
  }
  const cached = await loadCachedWidgetState();
  if (cached) renderWidget(renderTodayWidget(cached, widgetInfo));
  if (cached?.kind === 'signedOut') return;
  renderWidget(renderTodayWidget(await loadWidgetState(), widgetInfo));
};
