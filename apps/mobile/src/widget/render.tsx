import type { WidgetInfo, WidgetRepresentation } from 'react-native-android-widget';
import { buildWidgetModel, type WidgetState } from './model';
import { TodayWidget } from './TodayWidget';

/** Paket sistem temasına göre açık ya da koyu ağacı seçer. */
export function renderTodayWidget(state: WidgetState, info: WidgetInfo): WidgetRepresentation {
  const model = buildWidgetModel(state, { width: info.width, height: info.height });
  return {
    light: <TodayWidget model={model} theme="light" />,
    dark: <TodayWidget model={model} theme="dark" />,
  };
}
