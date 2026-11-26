/**
 * Strava webhook aboneliği (uygulama başına bir kez). Mevcut aboneliği listeler; yoksa oluşturur.
 *   pnpm --filter @takip/api strava:subscribe            # listele, yoksa oluştur
 *   pnpm --filter @takip/api strava:subscribe -- --delete  # mevcut aboneliği sil
 * Gerekli ortam: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN, PUBLIC_API_URL.
 * Strava oluşturma sırasında callback adresine GET doğrulaması atar: API o adreste çalışıyor olmalı.
 */
import { z } from 'zod';
import { STRAVA_API_URL, STRAVA_WEBHOOK_PATH } from '../services/strava.js';

const envSchema = z.object({
  STRAVA_CLIENT_ID: z.string().regex(/^\d+$/),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(16),
  PUBLIC_API_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
});

const subscriptionSchema = z.object({ id: z.number(), callback_url: z.string() });

async function main(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      'Eksik ortam değişkenleri:\n' +
        parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
    process.exit(1);
  }
  const env = parsed.data;
  const base = `${STRAVA_API_URL}/push_subscriptions`;
  const auth = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
  });

  const listRes = await fetch(`${base}?${auth.toString()}`);
  if (!listRes.ok)
    throw new Error(`Abonelikler alınamadı: ${listRes.status} ${await listRes.text()}`);
  const subs = z.array(subscriptionSchema).parse(await listRes.json());

  if (process.argv.includes('--delete')) {
    for (const s of subs) {
      const res = await fetch(`${base}/${s.id}?${auth.toString()}`, { method: 'DELETE' });
      console.log(`Abonelik ${s.id} silindi: ${res.status}`);
    }
    if (!subs.length) console.log('Silinecek abonelik yok.');
    return;
  }

  const callbackUrl = `${env.PUBLIC_API_URL}${STRAVA_WEBHOOK_PATH}`;
  if (subs.length) {
    for (const s of subs) console.log(`Mevcut abonelik: id=${s.id} callback=${s.callback_url}`);
    if (!subs.some((s) => s.callback_url === callbackUrl))
      console.log(`Uyarı: beklenen adres ${callbackUrl}. Değiştirmek için önce --delete ile sil.`);
    return;
  }

  const body = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    callback_url: callbackUrl,
    verify_token: env.STRAVA_WEBHOOK_VERIFY_TOKEN,
  });
  const res = await fetch(base, { method: 'POST', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Abonelik oluşturulamadı: ${res.status} ${text}`);
  console.log(`Abonelik oluşturuldu: ${text} (callback ${callbackUrl})`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
