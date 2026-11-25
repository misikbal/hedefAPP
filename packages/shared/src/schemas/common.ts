import { z } from 'zod';

/** Yerel gün, YYYY-MM-DD */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı');
/** Saat, HH:mm */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat SS:dd biçiminde olmalı');

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Geçersiz kimlik');

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
