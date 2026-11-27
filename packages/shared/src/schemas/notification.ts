import { z } from 'zod';
import { THEME_PREFERENCES } from '../constants.js';
import { MOTIVATION_FREQS, NOTIFICATION_TYPES } from '../notifications.js';
import { objectIdSchema, timeOfDaySchema } from './common.js';
import { MCP_PERMISSION_MODES, mcpPermissionsSchema } from './mcp.js';

export const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  /** expo-router yolu, örn. "/penalties" */
  deepLink: z.string().nullable(),
  readAt: z.string().nullable(),
  sentAt: z.string(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unread: z.number(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const notificationIdParamsSchema = z.object({ id: objectIdSchema });

/** Expo push token: ExponentPushToken[...] ya da ExpoPushToken[...] */
export const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'Geçersiz Expo push token');

export const deviceRegisterSchema = z.object({
  expoPushToken: expoPushTokenSchema,
  platform: z.enum(['android', 'ios']).default('android'),
});
export const deviceUnregisterSchema = z.object({ expoPushToken: expoPushTokenSchema });

/* ---------- ayarlar ---------- */

export const settingsSchema = z.object({
  theme: z.enum(THEME_PREFERENCES),
  notif: z.object({
    blocks: z.boolean(),
    motivation: z.boolean(),
    penalties: z.boolean(),
    journal: z.boolean(),
  }),
  motivationFreq: z.enum(MOTIVATION_FREQS),
  quietHours: z.object({ start: z.string(), end: z.string() }),
  journalReminder: z.string(),
  skipAllowancePerWeek: z.number(),
  mcpPermissions: mcpPermissionsSchema,
});
export type SettingsDto = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = z
  .object({
    theme: z.enum(THEME_PREFERENCES),
    notif: z
      .object({
        blocks: z.boolean(),
        motivation: z.boolean(),
        penalties: z.boolean(),
        journal: z.boolean(),
      })
      .partial(),
    motivationFreq: z.enum(MOTIVATION_FREQS),
    quietHours: z.object({ start: timeOfDaySchema, end: timeOfDaySchema }),
    journalReminder: timeOfDaySchema,
    mcpPermissions: z
      .object({
        blockWrite: z.enum(MCP_PERMISSION_MODES),
        blockDelete: z.enum(MCP_PERMISSION_MODES),
        penaltyRuleWrite: z.enum(MCP_PERMISSION_MODES),
        journalRead: z.boolean(),
        journalRawNote: z.boolean(),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.input<typeof settingsPatchSchema>;

/* ---------- haftalık rapor ---------- */

export const weeklyReportParamsSchema = z.object({
  isoWeek: z
    .string()
    .regex(/^(latest|\d{4}-W\d{2})$/, 'Hafta YYYY-Www biçiminde olmalı (örn. 2026-W48)'),
});

export const weeklyReportSchema = z.object({
  isoWeek: z.string(),
  weekNumber: z.number(),
  weekStart: z.string(),
  weekEnd: z.string(),
  /** Hafta bitmediyse rapor o ana kadarki durumdur */
  complete: z.boolean(),
  blocks: z.object({ done: z.number(), total: z.number(), percent: z.number().nullable() }),
  days: z.array(
    z.object({
      date: z.string(),
      done: z.number(),
      total: z.number(),
      /** done / total, 0–1; o gün blok yoksa null */
      ratio: z.number().nullable(),
    }),
  ),
  bestDay: z.string().nullable(),
  goals: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      unit: z.string(),
      period: z.enum(['daily', 'weekly']),
      /** haftalık: toplam; günlük: haftanın günlük ortalaması */
      value: z.number(),
      target: z.number(),
      met: z.boolean(),
    }),
  ),
  penalties: z.object({
    created: z.number(),
    doneOnTime: z.number(),
    postponed: z.number(),
    open: z.number(),
  }),
  note: z.string(),
  computedAt: z.string(),
});
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
