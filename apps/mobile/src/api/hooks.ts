import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AuditEntry,
  AuditList,
  Block,
  BlockCreate,
  BlockHistory,
  BlockUpdate,
  FocusWeek,
  Goal,
  GoalCreate,
  GoalHistory,
  GoalSummary,
  GoalUpdate,
  Instance,
  InstanceStatus,
  JournalDay,
  JournalEntry,
  JournalPut,
  NotificationDto,
  McpStatus,
  NotificationList,
  PendingChangeDto,
  PendingChangeList,
  SettingsDto,
  SettingsPatch,
  WeeklyReport,
  Penalty,
  PenaltyRule,
  PenaltyRuleCreate,
  PenaltyRuleUpdate,
  ProgressCreate,
  ProgressLog,
  StatsOverview,
  StatsRange,
  TodayResponse,
  WeekResponse,
} from '@takip/shared';
import { api } from './client';

export const keys = {
  today: ['today'] as const,
  week: (start: string) => ['week', start] as const,
  weeks: ['week'] as const,
  blocks: ['blocks'] as const,
  block: (id: string) => ['blocks', id] as const,
  blockHistory: (id: string) => ['blocks', id, 'history'] as const,
  goals: ['goals'] as const,
  goal: (id: string) => ['goals', id] as const,
  goalHistory: (id: string) => ['goals', id, 'history'] as const,
  stats: ['stats'] as const,
  statsRange: (range: StatsRange) => ['stats', range] as const,
  penalties: ['penalties'] as const,
  penaltyList: (status: string, limit: number) => ['penalties', status, limit] as const,
  penaltyRules: ['penaltyRules'] as const,
  focus: ['focus'] as const,
  focusActive: ['focus', 'active'] as const,
  focusWeek: ['focus', 'week'] as const,
  focusLabels: ['focus', 'labels'] as const,
  journal: ['journal'] as const,
  journalDay: (date: string) => ['journal', 'day', date] as const,
  journalMonth: (month: string) => ['journal', 'month', month] as const,
  journalRecent: (before: string, limit: number) => ['journal', 'recent', before, limit] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  settings: ['settings'] as const,
  report: (week: string) => ['reports', week] as const,
  mcpStatus: ['mcp', 'status'] as const,
  audit: ['mcp', 'audit'] as const,
  pendingChanges: ['mcp', 'pending'] as const,
  pendingChange: (id: string) => ['mcp', 'pending', id] as const,
};

export const useToday = () =>
  useQuery({ queryKey: keys.today, queryFn: () => api<TodayResponse>('/today') });

export const useWeek = (start: string) =>
  useQuery({
    queryKey: keys.week(start),
    queryFn: () => api<WeekResponse>(`/week?start=${start}`),
  });

export const useBlocks = () =>
  useQuery({ queryKey: keys.blocks, queryFn: () => api<Block[]>('/blocks') });

export const useBlock = (id: string) =>
  useQuery({ queryKey: keys.block(id), queryFn: () => api<Block>(`/blocks/${id}`) });

export const useBlockHistory = (id: string, weeks = 6) =>
  useQuery({
    queryKey: keys.blockHistory(id),
    queryFn: () => api<BlockHistory>(`/blocks/${id}/history?weeks=${weeks}`),
  });

function invalidateSchedule(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.today });
  void qc.invalidateQueries({ queryKey: keys.weeks });
  void qc.invalidateQueries({ queryKey: keys.blocks });
  void qc.invalidateQueries({ queryKey: keys.stats });
}

/** İlerleme değişince hedef özetleri, geçmiş ve istatistikler yenilenir. */
function invalidateProgress(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.today });
  void qc.invalidateQueries({ queryKey: keys.goals });
  void qc.invalidateQueries({ queryKey: keys.stats });
}

export const useGoals = () =>
  useQuery({ queryKey: keys.goals, queryFn: () => api<GoalSummary[]>('/goals') });

export const useGoal = (id: string) =>
  useQuery({ queryKey: keys.goal(id), queryFn: () => api<Goal>(`/goals/${id}`) });

export const useGoalHistory = (id: string | undefined, periods = 8) =>
  useQuery({
    queryKey: keys.goalHistory(id ?? ''),
    queryFn: () => api<GoalHistory>(`/goals/${id}/history?periods=${periods}`),
    enabled: !!id,
  });

export const useStats = (range: StatsRange) =>
  useQuery({
    queryKey: keys.statsRange(range),
    queryFn: () => api<StatsOverview>(`/stats/overview?range=${range}`),
  });

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalCreate) => api<Goal>('/goals', { method: 'POST', body }),
    onSuccess: () => invalidateProgress(qc),
  });
}

export function useUpdateGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalUpdate) => api<Goal>(`/goals/${id}`, { method: 'PATCH', body }),
    onSuccess: (goal) => {
      qc.setQueryData(keys.goal(id), goal);
      invalidateProgress(qc);
    },
  });
}

export function useDeleteGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Goal>(`/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateProgress(qc);
      void qc.invalidateQueries({ queryKey: keys.blocks });
    },
  });
}

export function useLogProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProgressCreate) => api<ProgressLog>('/progress', { method: 'POST', body }),
    onSuccess: () => invalidateProgress(qc),
  });
}

export function useCreateBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BlockCreate) => api<Block>('/blocks', { method: 'POST', body }),
    onSuccess: () => invalidateSchedule(qc),
  });
}

export function useUpdateBlock(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BlockUpdate) => api<Block>(`/blocks/${id}`, { method: 'PATCH', body }),
    onSuccess: (block) => {
      qc.setQueryData(keys.block(id), block);
      invalidateSchedule(qc);
    },
  });
}

export function useDeleteBlock(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Block>(`/blocks/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateSchedule(qc),
  });
}

type InstanceAction = 'done' | 'undo' | 'skip';
const optimisticStatus: Record<InstanceAction, InstanceStatus> = {
  done: 'done',
  undo: 'planned',
  skip: 'skipped',
};

/** İşaretleme iyimser güncellenir; hata olursa önbellek geri alınır. */
export function useInstanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: InstanceAction; blockId: string }) =>
      api<Instance>(`/instances/${id}/${action}`, { method: 'POST' }),
    onMutate: async ({ id, action }) => {
      await qc.cancelQueries({ queryKey: keys.today });
      await qc.cancelQueries({ queryKey: keys.weeks });
      const prevToday = qc.getQueryData<TodayResponse>(keys.today);
      const prevWeeks = qc.getQueriesData<WeekResponse>({ queryKey: keys.weeks });
      const patch = (i: Instance): Instance =>
        i.id === id ? { ...i, status: optimisticStatus[action] } : i;
      if (prevToday)
        qc.setQueryData(keys.today, { ...prevToday, instances: prevToday.instances.map(patch) });
      for (const [key, week] of prevWeeks) {
        if (week) {
          qc.setQueryData(key, {
            ...week,
            days: week.days.map((d) => ({ ...d, instances: d.instances.map(patch) })),
          });
        }
      }
      return { prevToday, prevWeeks };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevToday) qc.setQueryData(keys.today, ctx.prevToday);
      ctx?.prevWeeks.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_data, _err, { blockId }) => {
      void qc.invalidateQueries({ queryKey: keys.today });
      void qc.invalidateQueries({ queryKey: keys.weeks });
      void qc.invalidateQueries({ queryKey: keys.blockHistory(blockId) });
      // Hedefe bağlı bloklar ilerleme yazar.
      void qc.invalidateQueries({ queryKey: keys.goals });
      void qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

/* ---------- cezalar ---------- */

/** `status`: 'open' (bekleyen + ertelenen + yükseltilen), 'done' ya da virgüllü liste */
export const usePenalties = (status: string, limit = 50) =>
  useQuery({
    queryKey: keys.penaltyList(status, limit),
    queryFn: () => api<Penalty[]>(`/penalties?status=${status}&limit=${limit}`),
  });

export const usePenaltyRules = () =>
  useQuery({ queryKey: keys.penaltyRules, queryFn: () => api<PenaltyRule[]>('/penalty-rules') });

/** Ceza değişince Bugün uyarısı ve ceza listeleri yenilenir. */
function invalidatePenalties(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.today });
  void qc.invalidateQueries({ queryKey: keys.penalties });
}

/** Kural değişince "kaçarsa" etiketleri de değişir. */
function invalidateRules(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.penaltyRules });
  void qc.invalidateQueries({ queryKey: keys.today });
  void qc.invalidateQueries({ queryKey: keys.weeks });
}

export function usePenaltyAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'done' | 'postpone' }) =>
      api<Penalty>(`/penalties/${id}/${action}`, { method: 'POST' }),
    onSettled: () => invalidatePenalties(qc),
  });
}

export function useCreatePenaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PenaltyRuleCreate) =>
      api<PenaltyRule>('/penalty-rules', { method: 'POST', body }),
    onSuccess: () => invalidateRules(qc),
  });
}

/** Aç/kapat iyimser güncellenir. */
export function useUpdatePenaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PenaltyRuleUpdate }) =>
      api<PenaltyRule>(`/penalty-rules/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: keys.penaltyRules });
      const prev = qc.getQueryData<PenaltyRule[]>(keys.penaltyRules);
      if (prev && body.enabled !== undefined) {
        qc.setQueryData(
          keys.penaltyRules,
          prev.map((r) => (r.id === id ? { ...r, enabled: body.enabled! } : r)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.penaltyRules, ctx.prev);
    },
    onSettled: () => invalidateRules(qc),
  });
}

export function useDeletePenaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<PenaltyRule>(`/penalty-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateRules(qc);
      // Bağlı blok ve hedeflerin penaltyRuleId'si temizlenir.
      void qc.invalidateQueries({ queryKey: keys.blocks });
      void qc.invalidateQueries({ queryKey: keys.goals });
    },
  });
}

/* ---------- odak ---------- */

export const useFocusWeek = () =>
  useQuery({ queryKey: keys.focusWeek, queryFn: () => api<FocusWeek>('/focus/week') });

export const useFocusLabels = () =>
  useQuery({ queryKey: keys.focusLabels, queryFn: () => api<string[]>('/focus/labels') });

/* ---------- günlük ---------- */

export const useJournalDay = (date: string) =>
  useQuery({ queryKey: keys.journalDay(date), queryFn: () => api<JournalDay>(`/journal/${date}`) });

export const useJournalMonth = (month: string) =>
  useQuery({
    queryKey: keys.journalMonth(month),
    queryFn: () => api<JournalEntry[]>(`/journal?month=${month}`),
  });

export const useJournalRecent = (before: string, limit = 5) =>
  useQuery({
    queryKey: keys.journalRecent(before, limit),
    queryFn: () => api<JournalEntry[]>(`/journal/recent?before=${before}&limit=${limit}`),
  });

export function useSaveJournal(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JournalPut) =>
      api<JournalEntry>(`/journal/${date}`, { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.journal }),
  });
}

/* ---------- bildirimler, ayarlar, rapor (Faz 5) ---------- */

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<NotificationList>('/notifications?limit=50'),
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: keys.unread,
    queryFn: () => api<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 5 * 60_000,
  });

export function useReadAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onMutate: () => {
      const prev = qc.getQueryData<NotificationList>(keys.notifications);
      const now = new Date().toISOString();
      if (prev)
        qc.setQueryData<NotificationList>(keys.notifications, {
          unread: 0,
          items: prev.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
        });
      qc.setQueryData(keys.unread, { unread: 0 });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<NotificationDto>(`/notifications/${id}/read`, { method: 'POST' }),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsDto>('/settings') });

/** Anahtarlar anında değişir (iyimser); hata olursa önceki değere döner. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsPatch) => api<SettingsDto>('/settings', { method: 'PATCH', body }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.settings });
      const prev = qc.getQueryData<SettingsDto>(keys.settings);
      if (prev) {
        qc.setQueryData<SettingsDto>(keys.settings, {
          ...prev,
          ...(patch.theme ? { theme: patch.theme } : {}),
          ...(patch.motivationFreq ? { motivationFreq: patch.motivationFreq } : {}),
          ...(patch.quietHours ? { quietHours: patch.quietHours } : {}),
          ...(patch.journalReminder ? { journalReminder: patch.journalReminder } : {}),
          notif: { ...prev.notif, ...patch.notif },
          mcpPermissions: { ...prev.mcpPermissions, ...patch.mcpPermissions },
        });
      }
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.settings, ctx.prev);
    },
    onSuccess: (s, patch) => {
      qc.setQueryData(keys.settings, s);
      if (patch.mcpPermissions) void qc.invalidateQueries({ queryKey: keys.mcpStatus });
    },
  });
}

/** `week`: "2026-W47" ya da "latest" */
export const useWeeklyReport = (week: string) =>
  useQuery({
    queryKey: keys.report(week),
    queryFn: () => api<WeeklyReport>(`/reports/weekly/${week}`),
  });

/* ---------- Claude (MCP) bağlantısı (Faz 6) ---------- */

export const useMcpStatus = () =>
  useQuery({
    queryKey: keys.mcpStatus,
    queryFn: () => api<McpStatus>('/mcp-status'),
    refetchInterval: 60_000,
  });

export const useClaudeAudit = (limit = 30) =>
  useQuery({
    queryKey: [...keys.audit, limit],
    queryFn: () => api<AuditList>(`/audit?actor=mcp&limit=${limit}`),
  });

export const usePendingChanges = (status = 'pending') =>
  useQuery({
    queryKey: [...keys.pendingChanges, 'list', status],
    queryFn: () => api<PendingChangeList>(`/pending-changes?status=${status}`),
  });

export const usePendingChange = (id: string) =>
  useQuery({
    queryKey: keys.pendingChange(id),
    queryFn: () => api<PendingChangeDto>(`/pending-changes/${id}`),
  });

/**
 * Claude'un (ya da onayın) değiştirdiği her şey: program, hedefler, ilerleme, cezalar, günlük.
 * Geri al / yinele / onayla hangi varlığa dokunduğunu söylemediği için hepsi yenilenir.
 * Blok hatırlatmaları, başarılı her mutasyondan sonra NotificationsLifecycle'ta yeniden kurulur.
 */
function invalidateClaudeChanges(qc: QueryClient) {
  invalidateSchedule(qc);
  invalidateProgress(qc);
  invalidatePenalties(qc);
  invalidateRules(qc);
  void qc.invalidateQueries({ queryKey: keys.journal });
  void qc.invalidateQueries({ queryKey: keys.mcpStatus });
  void qc.invalidateQueries({ queryKey: keys.audit });
  void qc.invalidateQueries({ queryKey: keys.pendingChanges });
}

export function useAuditUndo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'undo' | 'redo' }) =>
      api<AuditEntry>(`/audit/${id}/${action}`, { method: 'POST' }),
    onSettled: () => invalidateClaudeChanges(qc),
  });
}

export function useDecidePendingChange(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api<PendingChangeDto>(`/pending-changes/${id}/${decision}`, { method: 'POST' }),
    onSuccess: (dto) => qc.setQueryData(keys.pendingChange(id), dto),
    onSettled: () => invalidateClaudeChanges(qc),
  });
}
