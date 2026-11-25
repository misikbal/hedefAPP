import type { FastifyInstance } from 'fastify';
import { weeklyReportParamsSchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { getWeeklyReport } from '../../services/reports.js';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // :isoWeek = "2026-W47" ya da "latest"
  app.get('/reports/weekly/:isoWeek', async (req) => {
    const { isoWeek } = parse(weeklyReportParamsSchema, req.params);
    return getWeeklyReport(req.user, isoWeek);
  });
}
