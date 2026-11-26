import {
  formatNumber,
  remainingText,
  UNIT_LABELS,
  type Category,
  type InstanceStatus,
  type TodayResponse,
} from '@takip/shared';
import { todayEyebrow, todayLocal } from '../lib/date';

/**
 * Ana ekran widget'ının saf görünüm modeli: React Native'e ve widget paketine bağlı değildir,
 * böylece birim testleriyle denenebilir. Bileşen (`TodayWidget.tsx`) yalnızca bu modeli çizer.
 */

/** Widget'ın veri durumu: görev işleyicisi (`data.ts`) üretir. */
export type WidgetState =
  | { kind: 'signedOut' }
  /** Veri hiç alınamadı ve önbellek de yok */
  | { kind: 'unavailable' }
  | { kind: 'data'; today: TodayResponse; fetchedAt: string; stale: boolean };

export type BlockEmphasis = 'now' | 'next' | null;

export interface WidgetBlock {
  id: string;
  time: string;
  title: string;
  status: InstanceStatus;
  statusLabel: string;
  emphasis: BlockEmphasis;
  category: Category;
}

export interface WidgetGoal {
  id: string;
  name: string;
  valueText: string;
  /** 0–1 arası */
  ratio: number;
  done: boolean;
  category: Category;
}

export interface WidgetPenalty {
  text: string;
  remaining: string;
  overdue: boolean;
}

export interface WidgetLayout {
  twoColumns: boolean;
  maxBlocks: number;
  maxGoals: number;
}

export type WidgetModel =
  | { kind: 'signedOut' }
  | { kind: 'unavailable' }
  | {
      kind: 'today';
      eyebrow: string;
      /** "2/6" */
      counter: string;
      blocks: WidgetBlock[];
      /** Sığmadığı için gösterilmeyen blok sayısı */
      hiddenBlocks: number;
      goals: WidgetGoal[];
      penalty: WidgetPenalty | null;
      /** Son güncelleme başarısız: önbellekteki veri gösteriliyor */
      stale: boolean;
      /** Önbellekteki veri önceki bir güne ait: bloklar gösterilmez */
      staleDay: boolean;
      /** Blok listesi yerine gösterilecek metin */
      emptyText: string | null;
      layout: WidgetLayout;
    };

const PADDING = 12;
const HEADER_H = 22;
const PENALTY_H = 28;
const BLOCK_ROW_H = 20;
const GOAL_ROW_H = 32;
const TWO_COLUMN_MIN_WIDTH = 280;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Widget boyutuna (dp) göre kaç blok ve hedef satırı sığar. */
export function widgetLayout(width: number, height: number, hasPenalty: boolean): WidgetLayout {
  const avail = height - PADDING * 2 - HEADER_H - (hasPenalty ? PENALTY_H : 0);
  if (width >= TWO_COLUMN_MIN_WIDTH) {
    return {
      twoColumns: true,
      maxBlocks: clamp(Math.floor(avail / BLOCK_ROW_H), 1, 8),
      maxGoals: clamp(Math.floor(avail / GOAL_ROW_H), 0, 3),
    };
  }
  // Dar widget: hedefler yalnız yer varsa blokların altında.
  const maxGoals = avail >= 140 ? clamp(Math.floor((avail * 0.4) / GOAL_ROW_H), 0, 3) : 0;
  return {
    twoColumns: false,
    maxBlocks: clamp(Math.floor((avail - maxGoals * GOAL_ROW_H) / BLOCK_ROW_H), 1, 8),
    maxGoals,
  };
}

const STATUS_LABEL: Record<InstanceStatus, string> = {
  planned: 'planlandı',
  done: 'yapıldı',
  missed: 'kaçtı',
  skipped: 'atlandı',
};

type Instance = TodayResponse['instances'][number];

/**
 * Şu anki blok (planlı ve saati içinde) ya da yoksa sıradaki planlı blok vurgulanır.
 * Pencere vurgulanan bloğun bir öncesinden başlar; liste sonuna dayanırsa geriye kayar.
 */
export function selectBlocks(
  instances: readonly Instance[],
  now: Date,
  max: number,
): { blocks: WidgetBlock[]; hidden: number } {
  const sorted = [...instances].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const t = now.getTime();
  const nowIdx = sorted.findIndex(
    (i) =>
      i.status === 'planned' &&
      new Date(i.startAt).getTime() <= t &&
      t < new Date(i.endAt).getTime(),
  );
  const nextIdx =
    nowIdx >= 0
      ? -1
      : sorted.findIndex((i) => i.status === 'planned' && new Date(i.startAt).getTime() > t);
  const focusIdx = nowIdx >= 0 ? nowIdx : nextIdx >= 0 ? nextIdx : sorted.length - 1;
  const take = Math.max(0, Math.min(max, sorted.length));
  const start = clamp(focusIdx - 1, 0, sorted.length - take);

  const blocks = sorted.slice(start, start + take).map((i, k): WidgetBlock => {
    const idx = start + k;
    const emphasis: BlockEmphasis = idx === nowIdx ? 'now' : idx === nextIdx ? 'next' : null;
    return {
      id: i.id,
      time: i.startTime,
      title: i.title,
      status: i.status,
      statusLabel:
        emphasis === 'now' ? 'şimdi' : emphasis === 'next' ? 'sıradaki' : STATUS_LABEL[i.status],
      emphasis,
      category: i.category,
    };
  });
  return { blocks, hidden: sorted.length - blocks.length };
}

export function goalRows(goals: TodayResponse['goals'], max: number): WidgetGoal[] {
  return goals.slice(0, max).map((g) => ({
    id: g.id,
    name: g.name,
    valueText: `${formatNumber(g.current)}/${formatNumber(g.target)} ${UNIT_LABELS[g.unit]}`,
    ratio: g.target > 0 ? clamp(g.current / g.target, 0, 1) : 0,
    done: g.status === 'done',
    category: g.category,
  }));
}

export function penaltyRow(
  penalty: TodayResponse['pendingPenalty'],
  now: Date,
): WidgetPenalty | null {
  if (!penalty) return null;
  const left = new Date(penalty.dueAt).getTime() - now.getTime();
  return { text: penalty.text, remaining: remainingText(left), overdue: left <= 0 };
}

export function buildWidgetModel(
  state: WidgetState,
  size: { width: number; height: number },
  now: Date = new Date(),
): WidgetModel {
  if (state.kind !== 'data') return state;
  const { today } = state;
  const penalty = penaltyRow(today.pendingPenalty, now);
  const layout = widgetLayout(size.width, size.height, penalty !== null);
  // Gün değiştiyse ve yeni gün alınamadıysa dünün blokları gösterilmez.
  const staleDay = today.date !== todayLocal(now);
  const { blocks, hidden } = staleDay
    ? { blocks: [], hidden: 0 }
    : selectBlocks(today.instances, now, layout.maxBlocks);
  const done = today.instances.filter((i) => i.status === 'done').length;
  return {
    kind: 'today',
    eyebrow: todayEyebrow(staleDay ? todayLocal(now) : today.date),
    counter: staleDay ? '' : `${done}/${today.instances.length}`,
    blocks,
    hiddenBlocks: hidden,
    goals: staleDay ? [] : goalRows(today.goals, layout.maxGoals),
    penalty,
    stale: state.stale,
    staleDay,
    emptyText: staleDay
      ? 'Bugünün programı henüz yüklenmedi'
      : today.instances.length === 0
        ? 'Bugün için program yok'
        : null,
    layout,
  };
}
