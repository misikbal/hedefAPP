import type { FastifyInstance } from 'fastify';
import {
  budgetSetSchema,
  moneyMonthQuerySchema,
  moneyYearQuerySchema,
  localDateOf,
  transactionCreateSchema,
  transactionIdParamsSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toTransactionDto } from '../../lib/serialize.js';
import { clock } from '../../services/clock.js';
import {
  createTransaction,
  currentMonth,
  deleteTransaction,
  listBudgets,
  listTransactions,
  monthSummary,
  setBudget,
  updateTransaction,
  yearSummary,
} from '../../services/money.js';

export async function moneyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/money/summary', async (req) => {
    const { month } = parse(moneyMonthQuerySchema, req.query);
    return monthSummary(req.user, month ?? currentMonth(req.user));
  });

  app.get('/money/year', async (req) => {
    const { year } = parse(moneyYearQuerySchema, req.query);
    const y = year ?? Number(localDateOf(clock.now(), req.user.timezone).slice(0, 4));
    return yearSummary(req.user, y);
  });

  app.get('/money/transactions', async (req) => {
    const q = parse(transactionListQuerySchema, req.query);
    return { items: (await listTransactions(req.user, q)).map(toTransactionDto) };
  });

  app.post('/money/transactions', async (req, reply) => {
    const body = parse(transactionCreateSchema, req.body);
    return reply.status(201).send(toTransactionDto(await createTransaction(req.user, body, 'app')));
  });

  app.patch('/money/transactions/:id', async (req) => {
    const { id } = parse(transactionIdParamsSchema, req.params);
    const body = parse(transactionUpdateSchema, req.body);
    return toTransactionDto(await updateTransaction(req.user, id, body));
  });

  app.delete('/money/transactions/:id', async (req, reply) => {
    const { id } = parse(transactionIdParamsSchema, req.params);
    await deleteTransaction(req.user, id);
    return reply.status(204).send();
  });

  app.get('/money/budgets', async (req) => listBudgets(req.user));

  app.put('/money/budgets', async (req) => {
    return setBudget(req.user, parse(budgetSetSchema, req.body));
  });
}
