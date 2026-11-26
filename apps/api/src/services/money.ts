import type { Types } from 'mongoose';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MONEY_CATEGORY_LABELS,
  addMonths,
  budgetStatusOf,
  budgetSetSchema,
  defaultCategoryOf,
  formatMoney,
  localDateOf,
  monthEndOf,
  transactionCreateSchema,
  transactionUpdateSchema,
  type Budget as BudgetDto,
  type BudgetSet,
  type MoneyCategory,
  type MoneyCategoryTotal,
  type MoneyMonthSummary,
  type MoneyType,
  type MoneyYearSummary,
  type TransactionCreate,
  type TransactionUpdate,
} from '@takip/shared';
import { Budget, Transaction, type TransactionDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { toTransactionDto } from '../lib/serialize.js';
import { clock } from './clock.js';
import { notify } from './notify.js';
import type { UserContext } from './users.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: { amount: number }[]) => round2(xs.reduce((a, t) => a + t.amount, 0));

export const currentMonth = (user: UserContext): string =>
  localDateOf(clock.now(), user.timezone).slice(0, 7);

const monthRange = (month: string) => ({ from: `${month}-01`, to: monthEndOf(`${month}-01`) });

/* ---------- kayıtlar ---------- */

export async function createTransaction(
  user: UserContext,
  input: TransactionCreate,
  source: 'app' | 'mcp' = 'app',
): Promise<TransactionDoc> {
  const data = transactionCreateSchema.parse(input);
  const today = localDateOf(clock.now(), user.timezone);
  const date = data.date ?? today;
  if (date > today) throw new AppError(400, 'DATE_IN_FUTURE', 'İleri bir tarihe kayıt girilemez');
  const doc = await Transaction.create({
    userId: user.id,
    type: data.type,
    amount: round2(data.amount),
    category: data.category ?? defaultCategoryOf(data.type),
    date,
    note: data.note || null,
    source,
  });
  if (doc.type === 'expense') await checkBudgetAlerts(user, doc);
  return doc;
}

export async function getTransaction(user: UserContext, id: string | Types.ObjectId) {
  const doc = await Transaction.findOne({ _id: id, userId: user.id });
  if (!doc) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Kayıt bulunamadı');
  return doc;
}

export async function updateTransaction(
  user: UserContext,
  id: string,
  input: TransactionUpdate,
): Promise<TransactionDoc> {
  const data = transactionUpdateSchema.parse(input);
  const doc = await getTransaction(user, id);
  if (data.category !== undefined) {
    const valid: readonly string[] = doc.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!valid.includes(data.category))
      throw new AppError(400, 'CATEGORY_MISMATCH', 'Kategori kayıt türüne uymuyor');
    doc.category = data.category;
  }
  if (data.amount !== undefined) doc.amount = round2(data.amount);
  if (data.date !== undefined) {
    if (data.date > localDateOf(clock.now(), user.timezone))
      throw new AppError(400, 'DATE_IN_FUTURE', 'İleri bir tarihe kayıt girilemez');
    doc.date = data.date;
  }
  if (data.note !== undefined) doc.note = data.note || null;
  await doc.save();
  return doc;
}

export async function deleteTransaction(user: UserContext, id: string): Promise<void> {
  const res = await Transaction.deleteOne({ _id: id, userId: user.id });
  if (res.deletedCount === 0) throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Kayıt bulunamadı');
}

export async function listTransactions(
  user: UserContext,
  q: { month?: string | undefined; type?: MoneyType | undefined; category?: MoneyCategory | undefined; limit?: number },
): Promise<TransactionDoc[]> {
  const filter: Record<string, unknown> = { userId: user.id };
  if (q.month) {
    const { from, to } = monthRange(q.month);
    filter.date = { $gte: from, $lte: to };
  }
  if (q.type) filter.type = q.type;
  if (q.category) filter.category = q.category;
  return Transaction.find(filter)
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .limit(q.limit ?? 100);
}

/* ---------- bütçe ---------- */

export async function listBudgets(user: UserContext): Promise<BudgetDto[]> {
  const rows = await Budget.find({ userId: user.id }).lean();
  return rows.map((b) => ({ category: b.category ?? null, monthlyLimit: b.monthlyLimit }));
}

export async function setBudget(user: UserContext, input: BudgetSet): Promise<BudgetDto[]> {
  const data = budgetSetSchema.parse(input);
  const key = { userId: user.id, category: data.category };
  if (data.monthlyLimit === null) await Budget.deleteOne(key);
  else
    await Budget.updateOne(key, { $set: { monthlyLimit: round2(data.monthlyLimit) } }, { upsert: true });
  return listBudgets(user);
}

/** %80'e ulaşınca ve aşılınca (toplam ve kategori için) ayda bir kez bildirir. */
async function checkBudgetAlerts(user: UserContext, tx: TransactionDoc): Promise<void> {
  const month = tx.date.slice(0, 7);
  if (month !== currentMonth(user)) return;
  const budgets = await listBudgets(user);
  if (budgets.length === 0) return;
  const { from, to } = monthRange(month);
  const rows = await Transaction.find({
    userId: user.id,
    type: 'expense',
    date: { $gte: from, $lte: to },
  })
    .select('amount category')
    .lean();
  for (const b of budgets) {
    if (b.category !== null && b.category !== tx.category) continue;
    const spent = sum(b.category === null ? rows : rows.filter((r) => r.category === b.category));
    const status = budgetStatusOf(spent, b.monthlyLimit);
    if (status === 'ok') continue;
    const scope = b.category === null ? 'Aylık harcama' : MONEY_CATEGORY_LABELS[b.category];
    await notify.send(user.id, {
      type: 'budget_alert',
      dedupeKey: `budget:${month}:${b.category ?? 'total'}:${status}`,
      title: status === 'over' ? `${scope} limiti aşıldı` : `${scope} limitinin %80'ine geldin`,
      body: `${formatMoney(spent)} / ${formatMoney(b.monthlyLimit)}`,
    });
  }
}

/* ---------- özetler ---------- */

function totalsBy(
  rows: { amount: number; category: string }[],
  categories: readonly MoneyCategory[],
  limits: Map<string | null, number>,
  withStatus: boolean,
): MoneyCategoryTotal[] {
  return categories
    .map((category) => {
      const own = rows.filter((r) => r.category === category);
      const total = sum(own);
      const limit = withStatus ? (limits.get(category) ?? null) : null;
      return {
        category,
        total,
        count: own.length,
        limit,
        status: limit === null ? null : budgetStatusOf(total, limit),
      };
    })
    .filter((c) => c.count > 0 || c.limit !== null)
    .sort((a, b) => b.total - a.total);
}

export async function monthSummary(user: UserContext, month: string): Promise<MoneyMonthSummary> {
  const { from, to } = monthRange(month);
  const prev = addMonths(`${month}-01`, -1).slice(0, 7);
  const prevRange = monthRange(prev);
  const [docs, prevDocs, budgets] = await Promise.all([
    Transaction.find({ userId: user.id, date: { $gte: from, $lte: to } }).sort({ date: 1 }),
    Transaction.find({
      userId: user.id,
      type: 'expense',
      date: { $gte: prevRange.from, $lte: prevRange.to },
    })
      .select('amount')
      .lean(),
    listBudgets(user),
  ]);
  const expenses = docs.filter((d) => d.type === 'expense');
  const incomes = docs.filter((d) => d.type === 'income');
  const limits = new Map(budgets.map((b) => [b.category, b.monthlyLimit]));
  const expense = sum(expenses);
  const totalLimit = limits.get(null);

  const days = Number(to.slice(8, 10));
  const daily = new Map<string, number>();
  for (const e of expenses) daily.set(e.date, (daily.get(e.date) ?? 0) + e.amount);

  return {
    month,
    income: sum(incomes),
    expense,
    net: round2(sum(incomes) - expense),
    previousExpense: sum(prevDocs),
    budget:
      totalLimit === undefined
        ? null
        : {
            limit: totalLimit,
            spent: expense,
            left: round2(totalLimit - expense),
            status: budgetStatusOf(expense, totalLimit),
          },
    expenseByCategory: totalsBy(expenses, EXPENSE_CATEGORIES, limits, true),
    incomeByCategory: totalsBy(incomes, INCOME_CATEGORIES, limits, false),
    dailyExpense: Array.from({ length: days }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      return { date, total: round2(daily.get(date) ?? 0) };
    }),
    topExpenses: [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map(toTransactionDto),
    budgets,
  };
}

export async function yearSummary(user: UserContext, year: number): Promise<MoneyYearSummary> {
  const docs = await Transaction.find({
    userId: user.id,
    date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  })
    .select('type amount category date')
    .lean();
  const none = new Map<string | null, number>();
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const own = docs.filter((d) => d.date.startsWith(month));
    return {
      month,
      income: sum(own.filter((d) => d.type === 'income')),
      expense: sum(own.filter((d) => d.type === 'expense')),
    };
  });
  const income = round2(months.reduce((a, m) => a + m.income, 0));
  const expense = round2(months.reduce((a, m) => a + m.expense, 0));
  return {
    year,
    income,
    expense,
    net: round2(income - expense),
    months,
    expenseByCategory: totalsBy(
      docs.filter((d) => d.type === 'expense'),
      EXPENSE_CATEGORIES,
      none,
      false,
    ),
    incomeByCategory: totalsBy(
      docs.filter((d) => d.type === 'income'),
      INCOME_CATEGORIES,
      none,
      false,
    ),
  };
}
