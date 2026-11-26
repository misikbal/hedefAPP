import {
  AuditLog,
  Block,
  BlockInstance,
  FocusSession,
  Goal,
  JournalEntry,
  Notification,
  Penalty,
  PenaltyRule,
  PendingChange,
  ProgressLog,
  Settings,
  User,
  WeeklyReport,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import type { UserContext } from './users.js';

export const EXPORT_VERSION = 1;

/** userId ve __v her belgeden çıkarılır; geri kalan alanlar olduğu gibi kalır. */
const clean = <T extends Record<string, unknown>>(docs: T[]) =>
  docs.map(({ userId: _u, __v: _v, ...rest }) => rest);

/**
 * Kullanıcının bütün verisi (JSON yedeği). Parola özeti, oturum ve cihaz token'ları dahil edilmez.
 * Asıl yedek sunucudaki günlük MongoDB yedeğidir; bu dosya kişisel kopya içindir.
 */
export async function exportAll(user: UserContext) {
  const u = await User.findById(user.id).select('email timezone weekStart createdAt').lean();
  if (!u) throw new AppError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  const q = { userId: user.id };
  const [
    settings,
    blocks,
    instances,
    goals,
    progress,
    penaltyRules,
    penalties,
    focusSessions,
    journal,
    notifications,
    weeklyReports,
    auditLog,
    pendingChanges,
  ] = await Promise.all([
    Settings.findOne(q).lean(),
    Block.find(q).lean(),
    BlockInstance.find(q).sort({ date: 1 }).lean(),
    Goal.find(q).lean(),
    ProgressLog.find(q).sort({ date: 1 }).lean(),
    PenaltyRule.find(q).lean(),
    Penalty.find(q).sort({ createdAt: 1 }).lean(),
    FocusSession.find(q).sort({ startedAt: 1 }).lean(),
    JournalEntry.find(q).sort({ date: 1 }).lean(),
    Notification.find(q).select('-push').sort({ sentAt: 1 }).lean(),
    WeeklyReport.find(q).sort({ isoWeek: 1 }).lean(),
    AuditLog.find(q).sort({ createdAt: 1 }).lean(),
    PendingChange.find(q).sort({ createdAt: 1 }).lean(),
  ]);
  return {
    app: 'takip',
    version: EXPORT_VERSION,
    exportedAt: clock.now().toISOString(),
    user: { email: u.email, timezone: u.timezone, weekStart: u.weekStart, createdAt: u.createdAt },
    settings: settings ? clean([settings])[0] : null,
    blocks: clean(blocks),
    instances: clean(instances),
    goals: clean(goals),
    progress: clean(progress),
    penaltyRules: clean(penaltyRules),
    penalties: clean(penalties),
    focusSessions: clean(focusSessions),
    journal: clean(journal),
    notifications: clean(notifications),
    weeklyReports: clean(weeklyReports),
    auditLog: clean(auditLog),
    pendingChanges: clean(pendingChanges),
  };
}
