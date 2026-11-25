import {
  focusElapsedMs,
  penaltyConsequence,
  scalePenaltyText,
  type Block as BlockDto,
  type FocusSession as FocusSessionDto,
  type JournalEntry as JournalEntryDto,
  type Goal as GoalDto,
  type Instance,
  type Penalty as PenaltyDto,
  type ProgressLog as ProgressLogDto,
  type NotificationDto,
  type SettingsDto,
} from '@takip/shared';
import type {
  BlockDoc,
  BlockInstanceDoc,
  FocusSessionDoc,
  GoalDoc,
  JournalEntryDoc,
  PenaltyDoc,
  ProgressLogDoc,
  NotificationDoc,
  SettingsDoc,
} from '../db/models/index.js';
import { deadlineOf } from '../services/penaltyRules.js';

const idOrNull = (v: unknown): string | null => (v == null ? null : String(v));

export function toBlockDto(b: BlockDoc): BlockDto {
  return {
    id: b.id as string,
    title: b.title,
    description: b.description ?? null,
    category: b.category,
    daysOfWeek: [...b.daysOfWeek],
    startTime: b.startTime,
    endTime: b.endTime,
    repeatWeekly: b.repeatWeekly,
    validFrom: b.validFrom,
    validTo: b.validTo ?? null,
    goalId: idOrNull(b.goalId),
    goalAmount: b.goalAmount ?? null,
    penaltyRuleId: idOrNull(b.penaltyRuleId),
    reminderMinutes: b.reminderMinutes ?? null,
    archived: b.archived,
  };
}

export function toInstanceDto(
  i: BlockInstanceDoc,
  block: BlockDoc,
  penalty: string | null = null,
): Instance {
  return {
    id: i.id as string,
    blockId: String(i.blockId),
    date: i.date,
    startAt: i.startAt.toISOString(),
    endAt: i.endAt.toISOString(),
    startTime: i.overrides?.startTime ?? block.startTime,
    endTime: i.overrides?.endTime ?? block.endTime,
    status: i.status,
    doneAt: i.doneAt ? i.doneAt.toISOString() : null,
    title: i.overrides?.title ?? block.title,
    description: block.description ?? null,
    category: block.category,
    penalty,
  };
}

export function toGoalDto(g: GoalDoc): GoalDto {
  return {
    id: g.id as string,
    name: g.name,
    target: g.target,
    unit: g.unit,
    period: g.period,
    startDate: g.startDate,
    trackStreak: g.trackStreak,
    category: g.category,
    penaltyRuleId: idOrNull(g.penaltyRuleId),
    archived: g.archived,
  };
}

export function toProgressDto(p: ProgressLogDoc): ProgressLogDto {
  return {
    id: p.id as string,
    goalId: String(p.goalId),
    amount: p.amount,
    date: p.date,
    source: p.source,
    note: p.note ?? null,
  };
}

export function toPenaltyDto(p: PenaltyDoc): PenaltyDto {
  return {
    id: p.id as string,
    ruleId: String(p.ruleId),
    reason: p.reason,
    sourceRef: { type: p.sourceRef.type, id: p.sourceRef.id },
    penalty: p.penalty,
    multiplier: p.multiplier,
    text: scalePenaltyText(p.penalty, p.multiplier),
    consequence: penaltyConsequence(deadlineOf(p.deadline), p.onFail),
    onFail: p.onFail,
    dueAt: p.dueAt.toISOString(),
    status: p.status,
    resolvedAt: p.resolvedAt ? p.resolvedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toFocusDto(s: FocusSessionDoc, now: Date): FocusSessionDto {
  const elapsedMs = focusElapsedMs(
    {
      plannedMinutes: s.plannedMinutes,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      pausedMs: s.pausedMs,
      pausedAt: s.pausedAt,
    },
    now,
  );
  return {
    id: s.id as string,
    label: s.label,
    plannedMinutes: s.plannedMinutes,
    date: s.date,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    pausedMs: s.pausedMs,
    pausedAt: s.pausedAt ? s.pausedAt.toISOString() : null,
    status: s.status,
    interruptions: s.interruptions,
    backgroundMs: s.backgroundMs,
    note: s.note ?? null,
    goalId: idOrNull(s.goalId),
    progressLogId: idOrNull(s.progressLogId),
    elapsedMs,
    reachedPeak: elapsedMs >= s.plannedMinutes * 60_000,
    serverNow: now.toISOString(),
  };
}

export function toJournalDto(e: JournalEntryDoc): JournalEntryDto {
  return {
    id: e.id as string,
    date: e.date,
    mood: e.mood,
    wentWell: e.wentWell ?? null,
    hard: e.hard ?? null,
    tomorrowOne: e.tomorrowOne ?? null,
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function toNotificationDto(n: NotificationDoc): NotificationDto {
  return {
    id: n.id as string,
    type: n.type as NotificationDto['type'],
    title: n.title,
    body: n.body,
    deepLink: n.deepLink ?? null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    sentAt: n.sentAt.toISOString(),
  };
}

export function toSettingsDto(s: SettingsDoc): SettingsDto {
  return {
    theme: s.theme as SettingsDto['theme'],
    notif: {
      blocks: s.notif?.blocks !== false,
      motivation: s.notif?.motivation !== false,
      penalties: s.notif?.penalties !== false,
      journal: s.notif?.journal !== false,
    },
    motivationFreq: s.motivationFreq as SettingsDto['motivationFreq'],
    quietHours: { start: s.quietHours?.start ?? '00:00', end: s.quietHours?.end ?? '06:30' },
    journalReminder: s.journalReminder ?? '23:00',
    skipAllowancePerWeek: s.skipAllowancePerWeek ?? 1,
  };
}
