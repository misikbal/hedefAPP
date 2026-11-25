import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb } from './db/connection.js';
import type { Agenda } from 'agenda';
import { buildApp } from './app.js';
import { startJobs } from './jobs/index.js';
import { configurePush } from './services/push.js';
import { ensureAdminUser } from './services/users.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);
  configurePush({ accessToken: env.EXPO_ACCESS_TOKEN });
  let agenda: Agenda | null = null;

  try {
    await connectDb(env.MONGODB_URI);
    app.log.info('MongoDB bağlantısı kuruldu');
    const seeded = await ensureAdminUser(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, env.APP_TIMEZONE);
    if (seeded === 'created')
      app.log.warn('İlk kullanıcı oluşturuldu; ADMIN_PASSWORD değerini ortamdan silebilirsin');
    agenda = await startJobs(app.log, env.APP_TIMEZONE);
    app.log.info('Zamanlanmış işler başladı (ceza motoru 15 dk)');
  } catch (err) {
    // Sunucu yine de açılır; /health db:down döner ve mongoose yeniden dener.
    app.log.error({ err }, 'MongoDB bağlantısı kurulamadı');
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'kapanıyor');
    await app.close();
    await agenda?.stop();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
