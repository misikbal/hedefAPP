import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  db: z.enum(['up', 'down']),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
