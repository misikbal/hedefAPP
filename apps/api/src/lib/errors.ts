import type { FastifyInstance } from 'fastify';
import type { ApiError } from '@takip/shared';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function body(code: string, message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Tüm hataları { error: { code, message, details? } } biçimine çevirir. Mesajlar Türkçe. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    void reply.status(404).send(body('NOT_FOUND', 'Kaynak bulunamadı'));
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'Geçersiz istek', err.issues));
    }
    const status =
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
      return reply.status(500).send(body('INTERNAL_ERROR', 'Sunucu hatası'));
    }
    return reply.status(status).send(body('BAD_REQUEST', 'İstek işlenemedi'));
  });
}
