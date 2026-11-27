import {
  APP_TIMEZONE,
  UNIT_LABELS,
  focusRemainingMs,
  formatNumber,
  localTimeOf,
  type FocusSession,
  type GoalSummary,
  type Penalty,
} from '@takip/shared';

/*
 * Kalıcı odak panelinin içeriği (saf; cihazsız test edilir). Yerel modül (`modules/focus-panel`)
 * bu modeli çizer; modül yoksa (Expo Go, iOS) `panelText` ile düz metin bildirimine çevrilir.
 */

export const PANEL_MAX_GOALS = 4;
export const PANEL_MAX_PENALTIES = 2;
/** Panel düğmesinin açtığı bağlantı; `s` = "<seansId>:<durum>", eski düğme yanlış seansı değiştirmesin */
export const PANEL_TOGGLE_PARAM = 'panel';

export interface PanelGoal {
  name: string;
  value: string;
  progress: number;
  done: boolean;
}

export interface PanelPenalty {
  text: string;
  due: string;
}

export interface FocusPanelModel {
  status: 'running' | 'paused';
  eyebrow: string;
  /** cihaz saatiyle bitiş anı (epoch ms) */
  endAt: number;
  totalMs: number;
  staticText: string;
  meta: string;
  summary: string;
  goalsTitle: string;
  goals: PanelGoal[];
  penaltiesTitle: string;
  penalties: PanelPenalty[];
  openUrl: string;
  actionLabel: string;
  actionUrl: string;
}

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');
const hhmm = (ms: number) => localTimeOf(new Date(ms), APP_TIMEZONE);

export function panelToggleUrl(s: Pick<FocusSession, 'id' | 'status'>): string {
  return `takip://focus?${PANEL_TOGGLE_PARAM}=toggle&s=${encodeURIComponent(`${s.id}:${s.status}`)}`;
}

/**
 * @param serverNow sunucu saatine göre şimdi (kalan süre hesabı)
 * @param deviceNow cihaz saati (yerel sayaç bu saate göre akar)
 */
export function buildFocusPanelModel(
  s: FocusSession,
  goals: GoalSummary[],
  penalties: Penalty[],
  serverNow: number,
  deviceNow: number,
): FocusPanelModel {
  const paused = s.status === 'paused';
  const remaining = Math.max(0, focusRemainingMs(s, serverNow));
  const endAt = deviceNow + remaining;
  const label = s.label.trim() || 'Odak';

  const open = goals.filter((g) => g.status !== 'done');
  const doneCount = goals.length - open.length;
  const shown = [...open, ...goals.filter((g) => g.status === 'done')].slice(0, PANEL_MAX_GOALS);

  const meta = paused
    ? `Duraklatıldı · ${s.plannedMinutes} dk seans`
    : `Bitiş ${hhmm(endAt)} · ${s.plannedMinutes} dk`;
  const parts = [meta];
  if (goals.length) parts.push(`${doneCount}/${goals.length} hedef`);
  const penCount =
    penalties.length > PANEL_MAX_PENALTIES ? `${PANEL_MAX_PENALTIES}+` : String(penalties.length);
  if (penalties.length) parts.push(`${penCount} ceza`);

  return {
    status: paused ? 'paused' : 'running',
    eyebrow: `${paused ? 'DURAKLATILDI' : 'ODAKTA'} · ${upper(label)}`,
    endAt,
    totalMs: s.plannedMinutes * 60_000,
    staticText: `${Math.ceil(remaining / 60_000)} dk`,
    meta,
    summary: parts.join(' · '),
    goalsTitle: `BUGÜNÜN HEDEFLERİ · ${doneCount}/${goals.length} TAMAM`,
    goals: shown.map((g) => ({
      name: g.name,
      value: `${g.status === 'done' ? '✓ ' : ''}${formatNumber(g.current)}/${formatNumber(g.target)} ${UNIT_LABELS[g.unit]}`,
      progress: g.target > 0 ? Math.min(1, Math.max(0, g.current / g.target)) : 0,
      done: g.status === 'done',
    })),
    penaltiesTitle: `AÇIK CEZALAR · ${penCount}`,
    penalties: penalties.slice(0, PANEL_MAX_PENALTIES).map((p) => ({
      text: p.text,
      due: `${hhmm(Date.parse(p.dueAt))}'e kadar`,
    })),
    openUrl: 'takip://focus',
    actionLabel: paused ? 'Devam et' : 'Duraklat',
    actionUrl: panelToggleUrl(s),
  };
}

/** Yerel modül yokken (expo-notifications) kullanılan düz metin */
export function panelText(m: FocusPanelModel): { title: string; body: string } {
  const lines = [m.status === 'paused' ? `${m.meta} · ${m.staticText} kaldı` : m.meta];
  if (m.goals.length) {
    lines.push('', m.goalsTitle, ...m.goals.map((g) => `${g.done ? '✓' : '•'} ${g.name}: ${g.value.replace('✓ ', '')}`));
  }
  if (m.penalties.length) {
    lines.push('', m.penaltiesTitle, ...m.penalties.map((p) => `! ${p.text} · ${p.due}`));
  }
  return { title: m.eyebrow, body: lines.join('\n') };
}
