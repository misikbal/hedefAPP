/**
 * Tasarımdaki örnek haftalık programı yükler (yalnızca geliştirme).
 * Kullanım: pnpm --filter @takip/api seed:demo
 */
import type { Types } from 'mongoose';
import {
  DAY_NAMES,
  FOCUS_MINUTES,
  addDays,
  minutesToGoalAmount,
  zonedDateTimeToUtc,
  isoDayOfWeek,
  isoWeekNumber,
  localDateOf,
  weekStartOf,
  type BlockCreate,
  type GoalCreate,
  type PenaltyRuleCreate,
} from '@takip/shared';
import { loadEnv } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connection.js';
import {
  Block,
  FocusSession,
  Goal,
  JournalEntry,
  Notification,
  Penalty,
  PenaltyRule,
  ProgressLog,
  User,
  type PenaltyRuleDoc,
} from '../db/models/index.js';
import { createBlock, updateBlock } from '../services/blocks.js';
import { createGoal } from '../services/goals.js';
import { createRule } from '../services/penaltyRules.js';
import { ensureAdminUser } from '../services/users.js';

const DEMO: BlockCreate[] = [
  {
    title: 'Bisiklet · 25 km',
    description: 'Sabah turu',
    category: 'sport',
    daysOfWeek: [1, 2, 5],
    startTime: '07:00',
    endTime: '08:00',
    reminderMinutes: 10,
  },
  {
    title: 'KODMIS — tema editörü',
    description: '2 × 50 dk odak',
    category: 'project',
    daysOfWeek: [1, 2, 4],
    startTime: '09:00',
    endTime: '11:00',
  },
  {
    title: 'AKSA ERP — arayüz',
    description: '3 × 50 dk odak',
    category: 'project',
    daysOfWeek: [3],
    startTime: '09:00',
    endTime: '12:00',
  },
  {
    title: 'Almanca · 15 kelime',
    description: 'Yeni kelimeler',
    category: 'language',
    daysOfWeek: [1, 2, 3, 5],
    startTime: '13:00',
    endTime: '13:30',
    reminderMinutes: 10,
  },
  {
    title: 'Bisiklet · 35 km',
    description: 'Akşam turu',
    category: 'sport',
    daysOfWeek: [3],
    startTime: '17:30',
    endTime: '19:00',
  },
  {
    title: 'Ders hazırlığı',
    description: 'Yapay Zekâ Seviye 3',
    category: 'project',
    daysOfWeek: [2],
    startTime: '18:30',
    endTime: '20:00',
  },
  {
    title: 'Bisiklet · 60 km',
    description: 'Uzun tur',
    category: 'sport',
    daysOfWeek: [6],
    startTime: '08:00',
    endTime: '11:00',
  },
  {
    title: 'Kitap · 20 sayfa',
    description: 'Okuma',
    category: 'reading',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startTime: '22:00',
    endTime: '22:40',
    reminderMinutes: 30,
  },
  {
    title: 'Günlük yaz',
    description: '3 dakikalık değerlendirme',
    category: 'other',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startTime: '23:00',
    endTime: '23:10',
  },
];

const GOALS: (GoalCreate & { links: [string, number][]; daily: number })[] = [
  {
    name: 'Bisiklet',
    target: 150,
    unit: 'km',
    period: 'weekly',
    category: 'sport',
    links: [
      ['Bisiklet · 25 km', 25],
      ['Bisiklet · 35 km', 35],
      ['Bisiklet · 60 km', 60],
    ],
    daily: 22,
  },
  {
    name: 'Kitap',
    target: 20,
    unit: 'sayfa',
    period: 'daily',
    category: 'reading',
    links: [['Kitap · 20 sayfa', 20]],
    daily: 19,
  },
  {
    name: 'Almanca',
    target: 75,
    unit: 'kelime',
    period: 'weekly',
    category: 'language',
    links: [['Almanca · 15 kelime', 15]],
    daily: 11,
  },
  {
    name: 'Odak',
    target: 15,
    unit: 'saat',
    period: 'weekly',
    category: 'project',
    links: [],
    daily: 2,
  },
];

/** Tasarımdaki 5 kural; hedef kuralları ada göre bağlanır. */
async function seedPenalties(ctx: { id: Types.ObjectId; timezone: string }): Promise<void> {
  const goalId = async (name: string) =>
    String((await Goal.findOne({ userId: ctx.id, name, archived: false }).orFail())._id);
  const rules: PenaltyRuleCreate[] = [
    {
      trigger: 'block_missed',
      targetType: 'category',
      category: 'sport',
      penalty: '3 dk soğuk duş',
    },
    {
      trigger: 'goal_failed',
      targetType: 'goal',
      targetId: await goalId('Kitap'),
      penalty: 'Ertesi gün +10 sayfa',
      onFail: 'plus_one',
    },
    {
      trigger: 'goal_failed',
      targetType: 'goal',
      targetId: await goalId('Almanca'),
      penalty: '50 şınav',
      deadline: { type: 'hours', hours: 48 },
    },
    {
      trigger: 'goal_failed',
      targetType: 'goal',
      targetId: await goalId('Odak'),
      penalty: '1 gün sosyal medya yok',
      deadline: { type: 'end_of_week' },
    },
    {
      trigger: 'penalty_postponed',
      targetType: 'any',
      penalty: '2 saat telefonsuz',
      enabled: false,
    },
  ];
  const created: PenaltyRuleDoc[] = [];
  for (const r of rules) created.push(await createRule(ctx, r));

  const now = new Date();
  const hour = 3_600_000;
  const today = localDateOf(now, ctx.timezone);
  const dayName = (offset: number) => DAY_NAMES[isoDayOfWeek(addDays(today, offset)) - 1];
  const lastWeek = isoWeekNumber(addDays(weekStartOf(today), -7));
  const base = (i: number) => ({
    userId: ctx.id,
    ruleId: created[i]!._id,
    penalty: created[i]!.penalty,
    onFail: created[i]!.onFail,
    deadline: created[i]!.deadline,
    multiplier: 1,
  });
  await Penalty.insertMany([
    {
      ...base(0),
      reason: `${dayName(-1)} 07:00 Bisiklet bloğu yapılmadı`,
      sourceRef: { type: 'instance', id: 'demo:pending' },
      dueAt: new Date(now.getTime() + 14 * hour),
      status: 'pending',
    },
    {
      ...base(1),
      reason: `${dayName(-3)} Kitap hedefi tutmadı (14/20 sayfa)`,
      sourceRef: { type: 'goal_period', id: 'demo:history-1' },
      dueAt: new Date(now.getTime() - 24 * hour),
      status: 'done',
      resolvedAt: new Date(now.getTime() - 40 * hour),
    },
    {
      ...base(2),
      reason: `Hafta ${lastWeek} Almanca hedefi tutmadı (65/75 kelime)`,
      sourceRef: { type: 'goal_period', id: 'demo:history-2' },
      dueAt: new Date(now.getTime() - 60 * hour),
      status: 'done',
      resolvedAt: new Date(now.getTime() - 70 * hour),
    },
    {
      ...base(0),
      reason: `${dayName(-5)} 07:00 Bisiklet bloğu yapılmadı`,
      sourceRef: { type: 'instance', id: 'demo:history-3' },
      dueAt: new Date(now.getTime() - 100 * hour),
      status: 'done',
      resolvedAt: new Date(now.getTime() - 110 * hour),
    },
  ]);
}

const FOCUS_LABELS = [
  'KODMIS — tema editörü',
  'AKSA ERP — arayüz',
  'Ders hazırlığı',
  'Almanca çalışma',
];
const SLOTS = ['09:00', '10:10', '14:00', '15:40'];

/** Son 4 haftanın odak seansları; "Odak" hedefinin o günlerdeki `app` kayıtlarının yerini alır. */
async function seedFocus(ctx: { id: Types.ObjectId; timezone: string }): Promise<number> {
  const goal = await Goal.findOne({ userId: ctx.id, name: 'Odak', archived: false });
  const today = localDateOf(new Date(), ctx.timezone);
  const from = addDays(today, -28);
  if (goal) {
    await ProgressLog.deleteMany({ goalId: goal._id, source: 'app', date: { $gte: from } });
  }
  let seed = 11;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let n = 0;
  for (let d = from; d < today; d = addDays(d, 1)) {
    const count = rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const plannedMinutes = FOCUS_MINUTES[rand() < 0.2 ? 0 : rand() < 0.8 ? 1 : 2];
      const startedAt = zonedDateTimeToUtc(d, SLOTS[i]!, ctx.timezone);
      const early = rand() < 0.15;
      const minutes = early ? Math.round(plannedMinutes * (0.4 + rand() * 0.4)) : plannedMinutes;
      const session = await FocusSession.create({
        userId: ctx.id,
        label: FOCUS_LABELS[Math.floor(rand() * FOCUS_LABELS.length)]!,
        plannedMinutes,
        date: d,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60_000),
        status: early && rand() < 0.5 ? 'interrupted' : 'completed',
        interruptions: early ? 1 : 0,
        goalId: goal?._id ?? null,
      });
      if (goal) {
        const amount = minutesToGoalAmount(minutes, goal.unit) ?? 0;
        const log = await ProgressLog.create({
          userId: ctx.id,
          goalId: goal._id,
          amount,
          date: d,
          source: 'focus',
          note: session.label,
        });
        await FocusSession.updateOne({ _id: session._id }, { progressLogId: log._id });
      }
      n++;
    }
  }
  return n;
}

const JOURNAL_NOTES: [number, string | null, string | null, string | null][] = [
  [4, 'Tüm hedefler tamam. 30 km + 3 odak seansı.', null, 'Kitaba erken başla'],
  [2, 'Dinlendim. Haftalık planı Claude ile hazırladık.', null, null],
  [1, null, 'Uzun tur yağmur yüzünden yarıda kaldı, +10 sayfa cezası geldi.', 'Yağmurluğu hazırla'],
  [3, 'Tema editöründe sürükle-bırak çalıştı.', 'Öğleden sonra dağıldım.', null],
  [3, 'Sabah turu keyifliydi.', null, 'Almanca kelimeleri sabah tekrar et'],
  [2, null, 'Toplantılar odak zamanını yedi.', 'Telefonu başka odada bırak'],
  [4, 'İki odak seansı üst üste, hiç bölünmeden.', null, null],
];

/** JOURNAL_NOTES ile aynı sırada: enerji ve etiketler */
const JOURNAL_EXTRAS: [number, string[]][] = [
  [4, ['spor', 'odak']],
  [2, ['sosyal']],
  [1, ['yorgunluk', 'spor']],
  [3, ['kod', 'odak']],
  [3, ['spor', 'dil']],
  [1, ['iş', 'stres']],
  [4, ['odak', 'kod']],
];

/** Son 30 günün günlük kayıtları (bugün hariç, birkaç gün boş). */
async function seedJournal(ctx: { id: Types.ObjectId; timezone: string }): Promise<number> {
  const today = localDateOf(new Date(), ctx.timezone);
  const docs = [];
  for (let i = 1; i <= 30; i++) {
    if (i % 9 === 5) continue;
    const k = i % JOURNAL_NOTES.length;
    const [mood, wentWell, hard, tomorrowOne] = JOURNAL_NOTES[k]!;
    const [energy, tags] = JOURNAL_EXTRAS[k]!;
    docs.push({
      userId: ctx.id,
      date: addDays(today, -i),
      mood,
      wentWell,
      hard,
      tomorrowOne,
      energy,
      tags,
      summary: wentWell ?? hard,
      source: i % 3 === 0 ? 'claude' : 'app',
    });
  }
  await JournalEntry.insertMany(docs);
  return docs.length;
}

/** Bildirimler ekranı için örnekler (push gönderilmez). */
async function seedNotifications(ctx: { id: Types.ObjectId }): Promise<number> {
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
  const docs = [
    ['motivation', 'Küçük bir adım', '8 sayfa kaldı. 12 günlük serini bozma.', '/goals', 1, false],
    [
      'penalty',
      'Yeni ceza: 3 dk soğuk duş',
      'Dün Almanca bloğu kaçtı, 24 saat içinde.',
      '/penalties',
      5,
      false,
    ],
    ['reminder', 'Günlük vakti', 'Bugünü 3 dakikada değerlendir.', '/journal', 22, true],
    [
      'motivation',
      'Haftanın yarısı',
      'Almanca 33/75. Bugün 15 kelime seni yolda tutar.',
      '/goals',
      28,
      true,
    ],
  ] as const;
  await Notification.insertMany(
    docs.map(([type, title, body, deepLink, h, read]) => ({
      userId: ctx.id,
      type,
      kind: 'demo',
      title,
      body,
      deepLink,
      sentAt: at(h),
      readAt: read ? at(h - 0.5) : null,
      push: { status: 'skipped' },
    })),
  );
  return docs.length;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') throw new Error('seed:demo üretimde çalıştırılamaz');
  await connectDb(env.MONGODB_URI);
  await ensureAdminUser(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, env.APP_TIMEZONE);
  const user = await User.findOne(
    env.ADMIN_EMAIL ? { email: env.ADMIN_EMAIL.toLowerCase() } : {},
  ).orFail(new Error('Kullanıcı yok: .env içinde ADMIN_EMAIL/ADMIN_PASSWORD tanımla'));
  if (await Block.exists({ userId: user._id, archived: false })) {
    console.log('Zaten blok var, demo verisi eklenmedi.');
  } else {
    const blockCtx = { id: user._id, timezone: user.timezone ?? env.APP_TIMEZONE };
    for (const b of DEMO) await createBlock(blockCtx, b);
    console.log(`${DEMO.length} demo blok eklendi (${user.email}).`);
  }
  const ctx = { id: user._id, timezone: user.timezone ?? env.APP_TIMEZONE };
  if (await Goal.exists({ userId: user._id, archived: false })) {
    console.log('Zaten hedef var, demo hedefleri eklenmedi.');
  } else {
    const today = localDateOf(new Date(), ctx.timezone);
    const start = addDays(today, -56);
    let seed = 7;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (const { links, daily, ...g } of GOALS) {
      const goal = await createGoal(ctx, { ...g, startDate: start });
      for (const [title, amount] of links) {
        const block = await Block.findOne({ userId: user._id, title, archived: false });
        if (block)
          await updateBlock(ctx, block.id as string, {
            goalId: goal.id as string,
            goalAmount: amount,
          });
      }
      // Son 8 hafta için örnek geçmiş (bugün hariç)
      const logs = [];
      for (let d = start; d < today; d = addDays(d, 1)) {
        if (rand() < 0.25) continue;
        logs.push({
          userId: user._id,
          goalId: goal._id,
          amount: Math.round(daily * (0.6 + rand() * 0.9) * 10) / 10,
          date: d,
          source: 'app',
        });
      }
      await ProgressLog.insertMany(logs);
    }
    console.log(`${GOALS.length} demo hedef ve 8 haftalık örnek ilerleme eklendi.`);
  }
  if (await PenaltyRule.exists({ userId: user._id })) {
    console.log('Zaten ceza kuralı var, demo cezaları eklenmedi.');
  } else {
    await seedPenalties(ctx);
    console.log('5 demo ceza kuralı, 1 bekleyen ve 3 kapanmış ceza eklendi.');
  }
  if (await FocusSession.exists({ userId: user._id })) {
    console.log('Zaten odak seansı var, demo seansları eklenmedi.');
  } else {
    console.log(`${await seedFocus(ctx)} demo odak seansı eklendi (son 4 hafta).`);
  }
  if (await JournalEntry.exists({ userId: user._id })) {
    console.log('Zaten günlük var, demo günlükleri eklenmedi.');
  } else {
    console.log(`${await seedJournal(ctx)} demo günlük kaydı eklendi (son 30 gün).`);
  }
  if (await Notification.exists({ userId: user._id })) {
    console.log('Zaten bildirim var, demo bildirimleri eklenmedi.');
  } else {
    console.log(`${await seedNotifications(ctx)} demo bildirim eklendi.`);
  }
  await disconnectDb();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
