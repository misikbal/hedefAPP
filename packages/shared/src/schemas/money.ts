import { z } from 'zod';
import { localDateSchema, objectIdSchema } from './common.js';

/**
 * Para takibi: gelir ve harcama kayıtları, aylık bütçe limitleri, aylık/yıllık özet.
 * Tek para birimi (TL). Tutarlar en çok 2 ondalıklı, pozitif; yön `type` ile belirlenir.
 */

export const MONEY_TYPES = ['expense', 'income'] as const;
export type MoneyType = (typeof MONEY_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  'food',
  'grocery',
  'transport',
  'bills',
  'rent',
  'fun',
  'health',
  'shopping',
  'education',
  'other_expense',
] as const;
export const INCOME_CATEGORIES = ['salary', 'extra', 'gift', 'other_income'] as const;
export const MONEY_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] as const;
export type MoneyCategory = (typeof MONEY_CATEGORIES)[number];

export const MONEY_CATEGORY_LABELS: Record<MoneyCategory, string> = {
  food: 'Yemek',
  grocery: 'Market',
  transport: 'Ulaşım',
  bills: 'Fatura',
  rent: 'Kira',
  fun: 'Eğlence',
  health: 'Sağlık',
  shopping: 'Alışveriş',
  education: 'Eğitim',
  other_expense: 'Diğer',
  salary: 'Maaş',
  extra: 'Ek gelir',
  gift: 'Hediye',
  other_income: 'Diğer gelir',
};

export const categoriesOf = (type: MoneyType): readonly MoneyCategory[] =>
  type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
export const defaultCategoryOf = (type: MoneyType): MoneyCategory =>
  type === 'income' ? 'other_income' : 'other_expense';
export const isExpenseCategory = (c: string): boolean =>
  (EXPENSE_CATEGORIES as readonly string[]).includes(c);

/** Bütçe uyarı eşiği (oran) */
export const BUDGET_WARN_RATIO = 0.8;

/** Tutar: pozitif, en çok 2 ondalık */
export const moneyAmountSchema = z
  .number({ message: 'Tutar sayı olmalı' })
  .positive('Tutar sıfırdan büyük olmalı')
  .max(100_000_000, 'Tutar çok büyük')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'En çok 2 ondalık');

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı');

/* ---------- kayıtlar ---------- */

export const transactionCreateSchema = z
  .object({
    type: z.enum(MONEY_TYPES),
    amount: moneyAmountSchema,
    category: z.enum(MONEY_CATEGORIES).optional(),
    date: localDateSchema.optional(),
    note: z.string().trim().max(200, 'En çok 200 karakter').optional(),
  })
  .refine((v) => v.category === undefined || categoriesOf(v.type).includes(v.category), {
    message: 'Kategori kayıt türüne uymuyor',
    path: ['category'],
  });
export type TransactionCreate = z.input<typeof transactionCreateSchema>;

export const transactionUpdateSchema = z
  .object({
    amount: moneyAmountSchema.optional(),
    category: z.enum(MONEY_CATEGORIES).optional(),
    date: localDateSchema.optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Değiştirilecek alan yok');
export type TransactionUpdate = z.input<typeof transactionUpdateSchema>;

export const transactionSchema = z.object({
  id: z.string(),
  type: z.enum(MONEY_TYPES),
  amount: z.number(),
  category: z.enum(MONEY_CATEGORIES),
  date: z.string(),
  note: z.string().nullable(),
  source: z.enum(['app', 'mcp']),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListQuerySchema = z.object({
  month: monthSchema.optional(),
  type: z.enum(MONEY_TYPES).optional(),
  category: z.enum(MONEY_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const transactionListSchema = z.object({
  items: z.array(transactionSchema),
});
export type TransactionList = z.infer<typeof transactionListSchema>;

export const transactionIdParamsSchema = z.object({ id: objectIdSchema });

/* ---------- bütçe ---------- */

export const budgetSetSchema = z.object({
  /** null = toplam harcama limiti */
  category: z.enum(EXPENSE_CATEGORIES).nullable(),
  /** null = limiti kaldır */
  monthlyLimit: moneyAmountSchema.nullable(),
});
export type BudgetSet = z.input<typeof budgetSetSchema>;

export const budgetSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).nullable(),
  monthlyLimit: z.number(),
});
export type Budget = z.infer<typeof budgetSchema>;

/* ---------- özetler ---------- */

export const BUDGET_STATUS = ['ok', 'warn', 'over'] as const;
export type BudgetStatus = (typeof BUDGET_STATUS)[number];

export const moneyCategoryTotalSchema = z.object({
  category: z.enum(MONEY_CATEGORIES),
  total: z.number(),
  count: z.number(),
  /** yalnız harcama kategorilerinde ve limit varsa */
  limit: z.number().nullable(),
  status: z.enum(BUDGET_STATUS).nullable(),
});
export type MoneyCategoryTotal = z.infer<typeof moneyCategoryTotalSchema>;

export const moneyMonthSummarySchema = z.object({
  month: z.string(),
  income: z.number(),
  expense: z.number(),
  /** gelir − gider */
  net: z.number(),
  /** bir önceki ayın toplam harcaması */
  previousExpense: z.number(),
  /** toplam harcama limiti */
  budget: z
    .object({
      limit: z.number(),
      spent: z.number(),
      left: z.number(),
      status: z.enum(BUDGET_STATUS),
    })
    .nullable(),
  expenseByCategory: z.array(moneyCategoryTotalSchema),
  incomeByCategory: z.array(moneyCategoryTotalSchema),
  /** ayın her günü için harcama (1. gün … son gün) */
  dailyExpense: z.array(z.object({ date: z.string(), total: z.number() })),
  /** en büyük 3 harcama */
  topExpenses: z.array(transactionSchema),
  budgets: z.array(budgetSchema),
});
export type MoneyMonthSummary = z.infer<typeof moneyMonthSummarySchema>;

export const moneyYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const moneyYearSummarySchema = z.object({
  year: z.number(),
  income: z.number(),
  expense: z.number(),
  net: z.number(),
  months: z.array(z.object({ month: z.string(), income: z.number(), expense: z.number() })),
  expenseByCategory: z.array(moneyCategoryTotalSchema),
  incomeByCategory: z.array(moneyCategoryTotalSchema),
});
export type MoneyYearSummary = z.infer<typeof moneyYearSummarySchema>;

export const moneyMonthQuerySchema = z.object({ month: monthSchema.optional() });

/** Bütçe durumu: oran ≥ 1 aşıldı, ≥ 0.8 uyarı */
export function budgetStatusOf(spent: number, limit: number): BudgetStatus {
  if (spent > limit) return 'over';
  if (spent >= limit * BUDGET_WARN_RATIO) return 'warn';
  return 'ok';
}

/** 1234.5 → "1.234,50 ₺" yerine sade: "1.234,5 ₺" (tam sayıysa ondalıksız) */
export function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [int, dec] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const tail = dec === '00' ? '' : `,${dec!.replace(/0$/, '')}`;
  return `${rounded < 0 ? '−' : ''}${grouped}${tail} ₺`;
}
