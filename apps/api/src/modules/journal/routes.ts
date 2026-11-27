import type { FastifyInstance } from 'fastify';
import {
  journalDateParamsSchema,
  journalInsightsQuerySchema,
  journalMonthQuerySchema,
  journalRecentQuerySchema,
} from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toJournalDto } from '../../lib/serialize.js';
import {
  getJournalDay,
  journalInsights,
  journalMonth,
  journalRecent,
  putJournal,
} from '../../services/journal.js';

export async function journalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/journal', async (req) => {
    const { month } = parse(journalMonthQuerySchema, req.query);
    return (await journalMonth(req.user, month)).map(toJournalDto);
  });
  // Statik yol, /journal/:date'ten önce eşleşir.
  app.get('/journal/recent', async (req) => {
    const { before, limit } = parse(journalRecentQuerySchema, req.query);
    return (await journalRecent(req.user, before, limit)).map(toJournalDto);
  });
  app.get('/journal/insights', async (req) => {
    const { range, date } = parse(journalInsightsQuerySchema, req.query);
    return journalInsights(req.user, range, date);
  });
  app.get('/journal/:date', async (req) => {
    const { date } = parse(journalDateParamsSchema, req.params);
    return getJournalDay(req.user, date);
  });
  app.put('/journal/:date', async (req) => {
    const { date } = parse(journalDateParamsSchema, req.params);
    return toJournalDto(await putJournal(req.user, date, (req.body ?? {}) as never));
  });
}
