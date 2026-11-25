import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.email('Geçerli bir e-posta gir').transform((s) => s.toLowerCase()),
  password: z.string().min(1, 'Şifre gerekli'),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;
