import type { z } from 'zod';

/** Dışarıdan gelen veriyi doğrular; hata ZodError olarak fırlar ve 400'e çevrilir. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}
