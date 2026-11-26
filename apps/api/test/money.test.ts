import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { moneyMonthSummarySchema, moneyYearSummarySchema, transactionSchema } from '@takip/shared';
import { Transaction } from '../src/db/models/index.js';
import { notify } from '../src/services/notify.js';
import {
  createUser,
  loginToken,
  makeApp,
  resetClock,
  resetDb,
  setNow,
  startDb,
  stopDb,
} from './helpers.js';

describe('para takibi', () => {
  let app: FastifyInstance;
  let token: string;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });
  const spend = (amount: number, category = 'grocery', date?: string) =>
    call('POST', '/money/transactions', { type: 'expense', amount, category, ...(date ? { date } : {}) });

  beforeAll(async () => {
    await startDb();
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
    await stopDb();
  });
  beforeEach(async () => {
    await resetDb();
    await createUser();
    token = await loginToken(app);
    setNow('2026-11-24T12:00:00Z');
  });
  afterEach(() => {
    resetClock();
    vi.restoreAllMocks();
  });

  it('hızlı giriş: kategori verilmezse "diğer", tarih bugün', async () => {
    const r = await call('POST', '/money/transactions', { type: 'expense', amount: 99.5 });
    expect(r.statusCode).toBe(201);
    expect(transactionSchema.parse(r.json())).toMatchObject({
      type: 'expense',
      amount: 99.5,
      category: 'other_expense',
      date: '2026-11-24',
      source: 'app',
    });
  });

  it('doğrulama: negatif/3 ondalık tutar, tür-kategori uyuşmazlığı, ileri tarih', async () => {
    expect((await spend(-5)).statusCode).toBe(400);
    expect((await spend(1.234)).statusCode).toBe(400);
    expect((await spend(10, 'salary')).statusCode).toBe(400);
    expect((await spend(10, 'food', '2026-11-30')).statusCode).toBe(400);
  });

  it('aylık özet: gelir, harcama, net, kategori, günlük, önceki ay', async () => {
    await call('POST', '/money/transactions', { type: 'income', amount: 10000, category: 'salary', date: '2026-11-01' });
    await spend(250, 'grocery', '2026-11-10');
    await spend(150.5, 'food', '2026-11-10');
    await spend(400, 'grocery', '2026-10-15');
    const r = await call('GET', '/money/summary?month=2026-11');
    const s = moneyMonthSummarySchema.parse(r.json());
    expect(s).toMatchObject({ income: 10000, expense: 400.5, net: 9599.5, previousExpense: 400 });
    expect(s.expenseByCategory.map((c) => [c.category, c.total])).toEqual([
      ['grocery', 250],
      ['food', 150.5],
    ]);
    expect(s.dailyExpense).toHaveLength(30);
    expect(s.dailyExpense[9]).toEqual({ date: '2026-11-10', total: 400.5 });
    expect(s.topExpenses[0]!.amount).toBe(250);
  });

  it('ay verilmezse bu ay (yerel saat dilimi)', async () => {
    setNow('2026-11-30T22:30:00Z'); // İstanbul'da 1 Aralık 01:30
    token = await loginToken(app);
    await spend(10, 'food');
    expect((await call('GET', '/money/summary')).json().month).toBe('2026-12');
  });

  it('yıllık özet: 12 ay ve toplamlar', async () => {
    await call('POST', '/money/transactions', { type: 'income', amount: 5000, category: 'salary', date: '2026-03-05' });
    await spend(1000, 'rent', '2026-03-06');
    await spend(200, 'fun', '2026-11-02');
    const y = moneyYearSummarySchema.parse((await call('GET', '/money/year?year=2026')).json());
    expect(y).toMatchObject({ income: 5000, expense: 1200, net: 3800 });
    expect(y.months).toHaveLength(12);
    expect(y.months[2]).toMatchObject({ month: '2026-03', income: 5000, expense: 1000 });
  });

  it('düzenle ve sil; başka türün kategorisi reddedilir', async () => {
    const id = (await spend(100)).json().id as string;
    const u = await call('PATCH', `/money/transactions/${id}`, { amount: 120, note: 'Migros' });
    expect(u.json()).toMatchObject({ amount: 120, note: 'Migros' });
    expect((await call('PATCH', `/money/transactions/${id}`, { category: 'salary' })).statusCode).toBe(400);
    expect((await call('DELETE', `/money/transactions/${id}`)).statusCode).toBe(204);
    expect((await call('DELETE', `/money/transactions/${id}`)).statusCode).toBe(404);
    expect(await Transaction.countDocuments()).toBe(0);
  });

  it('bütçe: limit koy/kaldır, özet durumu, %80 ve aşımda tek bildirim', async () => {
    const sent = vi.spyOn(notify, 'handler').mockResolvedValue();
    await call('PUT', '/money/budgets', { category: null, monthlyLimit: 1000 });
    await call('PUT', '/money/budgets', { category: 'food', monthlyLimit: 300 });

    await spend(500, 'grocery');
    expect(sent).not.toHaveBeenCalled();
    await spend(300, 'grocery'); // 800 = %80
    expect(sent).toHaveBeenCalledTimes(1);
    await spend(50, 'grocery'); // hâlâ uyarı; aynı anahtar için ikinci çağrı dedupe edilir (deliver'da)
    await spend(300, 'grocery'); // 1150 > 1000
    const keys = sent.mock.calls.map((c) => (c[1] as { dedupeKey: string }).dedupeKey);
    expect(keys).toContain('budget:2026-11:total:warn');
    expect(keys).toContain('budget:2026-11:total:over');

    const s = moneyMonthSummarySchema.parse((await call('GET', '/money/summary?month=2026-11')).json());
    expect(s.budget).toMatchObject({ limit: 1000, spent: 1150, left: -150, status: 'over' });

    const removed = await call('PUT', '/money/budgets', { category: null, monthlyLimit: null });
    expect(removed.json()).toEqual([{ category: 'food', monthlyLimit: 300 }]);
  });

  it('geçmiş aya yazılan harcama bütçe bildirimi göndermez', async () => {
    const sent = vi.spyOn(notify, 'handler').mockResolvedValue();
    await call('PUT', '/money/budgets', { category: null, monthlyLimit: 100 });
    await spend(500, 'food', '2026-10-05');
    expect(sent).not.toHaveBeenCalled();
  });

  it('liste: ay ve tür süzgeci, yeniden eskiye', async () => {
    await spend(1, 'food', '2026-11-01');
    await spend(2, 'food', '2026-11-05');
    await call('POST', '/money/transactions', { type: 'income', amount: 3, date: '2026-11-03' });
    const r = await call('GET', '/money/transactions?month=2026-11&type=expense');
    expect(r.json().items.map((t: { amount: number }) => t.amount)).toEqual([2, 1]);
  });

  it('oturum olmadan 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/money/summary' });
    expect(r.statusCode).toBe(401);
  });
});
