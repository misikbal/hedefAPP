# CLAUDE.md

Bu projenin tam bağlamı **[PROJE_CONTEXT.md](PROJE_CONTEXT.md)** dosyasındadır; her oturumda önce onu oku.
Ekran ayrıntıları: [tasarım_dokumani.md](tasarım_dokumani.md) ve `Kişisel Takip Uygulaması — Mobil Tasarım.html`.

## Kısa kurallar

- Kod/dosya adları İngilizce, kullanıcıya görünen metinler Türkçe. Emoji yok.
- TypeScript strict; dışarıdan gelen her girdi zod ile doğrulanır.
- Büyük bağımlılık eklemeden önce gerekçe yaz ve onay iste.
- Her faz sonunda: çalıştırma komutları, test sonuçları, "elle kontrol et" listesi ver ve dur.
- Gizli anahtar koda yazılmaz; `.env.example` yalnızca örnek değer içerir.
- Saat dilimi Europe/Istanbul, hafta pazartesi başlar; DB'de UTC.

## Monorepo

- pnpm workspaces: `apps/api`, `apps/mobile`, `packages/shared` (`@takip/shared`).
- Kök komutlar: `pnpm dev:api`, `pnpm dev:mobile`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:up`.
- Mobil için Expo'ya özgü kurallar: [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) (paket eklerken `npx expo install`).
  Rotalar bu projede `apps/mobile/app/` altında (src/app değil).

## Faz durumu

- Faz 0 — İskelet: tamamlandı (2026-11-25)
- Faz 1 — Veri ve program: tamamlandı (2026-11-25)
- Faz 2 — Hedefler ve ilerleme: tamamlandı (2026-11-25)
- Faz 3 — Cezalar: tamamlandı (2026-11-25, kullanıcı onayladı). Kararlar aşağıda.
- Faz 4 — Odak ve günlük: kodlandı (2026-11-25), kullanıcı onayı bekleniyor. Kararlar aşağıda.
- Faz 5 — Bildirimler: sırada (onaydan sonra)

## Notlar

- Geliştirme MongoDB'si 27018 portunda (27017'yi makinedeki başka bir proje kullanıyor).
- `ensureWeek` geçmiş günler için kayıt üretmez; blok oluşturulmadan önceki saatler de atlanır.
- Mobil, API adresini `apps/mobile/.env` → `EXPO_PUBLIC_API_URL` ile alır.
- Expo web yalnızca geliştirme kolaylığı: `react-native-web` + `react-dom` kurulu, API'de CORS yalnızca `NODE_ENV=development` iken açık, web'de token `localStorage`'da (`src/api/tokens.ts`). Asıl hedef Android.
- Expo komutları `apps/mobile` içinden çalıştırılır (kökte `expo` yok); kökten `pnpm dev:mobile`.
- Demo veri: `pnpm --filter @takip/api seed:demo` (bloklar, 4 hedef, 8 haftalık örnek ilerleme).
- Ceza motoru (`services/penaltyEngine.ts`, Agenda ile 15 dk) `endAt + 30 dk` geçen `planned` kayıtları `missed` yapar. İstatistikler motor gecikmesine karşı aynı 30 dk toleransla `planned` kayıtları da kaçırılmış sayar (`MISS_GRACE_MINUTES`).
- Tasarım ekranlarını okumak için: `python3 -I scripts/extract-design.py` → `design-extracted/`.
- Günlük hedeflerin geçmiş grafiği haftalık günlük ortalamadır (tasarımdaki gibi).
- Odak: süre hesabı tek yerde (`@takip/shared` → `focusElapsedMs`); seansın günü `startedAt`'in yerel günü (`FocusSession.date`). Mobil sayaç `src/store/focusStore.ts` (kalıcı) + `src/features/focus/actions.ts` (imperatif; AppState ve çıkış da kullanır) + `FocusLifecycle` (kökte, oturum açıkken).
- `POST /focus/:id/finish` idempotenttir: ilk çağrı seansı bitirip hedefe yazar, sonrakiler yalnızca not/bölünme günceller (Odak bitti ekranı böyle çalışır).
- `abandoned` (Sıfırla ya da 6 saat unutulan) seans hedefe yazılmaz ve zirvelerde görünmez.

## Faz 3 kararları (kullanıcı onayladı, 2026-11-25)

- Zamanlayıcı: `agenda` 6.2.8 + `@agendajs/mongo-backend` 4.0.5, mongoose'un `Db` bağlantısını kullanır (`jobs/index.ts`). Testler Agenda'yı başlatmaz, motoru doğrudan çağırır.
- Süre: `deadline: {type:'hours',hours} | {type:'end_of_week'}`. Hafta sonu = oluştuğu haftanın pazar 23:59'u; 24 saatten az kalıyorsa sonraki pazar.
- Kaçırılmış blok sonradan "yapıldı" işaretlenirse ceza kalır.
- `reset_streak`: `Goal.streakResetAt`; güncel seri sıfırlamanın düştüğü periyottan sayılır, en iyi seri korunur. Blok cezasında bloğun hedefi sıfırlanır.
- Yükseltme her süre bitişinde tekrarlar (borç sürer, yeni süre verilir). `plus_one`'dan doğan ek ceza çoğalmaz, iki katına çıkar.
- Kurallar geriye dönük uygulanmaz: kural, blok kaçmış sayılmadan / periyot kapanmadan önce oluşturulmuş olmalı. Hedeflerde eksik ilk periyot (startDate'ten önce başlayan) değerlendirilmez.
- Kural eşleştirme `@takip/shared` → `rulesForBlock` / `rulesForGoal` (öncelik: doğrudan bağlı > blok/hedef > kategori > herkes); API ve mobil aynı fonksiyonu kullanır.
- Bildirimler: `services/notify.ts` bilerek boş; Faz 5'te doldurulacak.

## Faz 4 kararları (kullanıcı onayladı, 2026-11-25)

- `expo-notifications` Faz 4'te kuruldu; yalnızca yerel bildirim (seans bitişi, mola bitişi). Push, kanallar ve token kaydı Faz 5'te. Yerel bildirim Expo Go'da çalışır, push çalışmaz.
- Arka plan > 10 sn: seans sürer (`running`), `interruptions` +1 (en çok 3), `backgroundMs` eklenir; ekranda "bölündü · arka planda N sn". Çıkış (logout) açık seansı `interrupted` olarak bitirir ve o ana kadarki süre hedefe yazılır.
- Duraklatma ayrı durum: `status: 'paused'` + `pausedAt`. Tek açık seans = partial unique `{ userId }` where status ∈ {running, paused}.
- "Ne üzerinde çalışıyorsun?": serbest metin + son kullanılan etiketler (`GET /focus/labels`).
- "Kaydet ve 10 dk mola": Odak sekmesinde 10 dk mola geri sayımı (yalnız cihazda, zustand) + mola bitişine yerel bildirim.
- Çift sayım: seans ve hedefe bağlı blok bağımsız sayılır (kullanıcı blokları Odak hedefine bağlamaz).
- Günlük günü: yerel 04:00'e kadar önceki gün (`JOURNAL_DAY_CUTOFF_HOUR`), gün çipiyle değiştirilebilir.
- Demo veri: son 4 haftanın odak seansları ("Odak" hedefi `focus` kaynaklı kayıtlarla) + son 30 günün günlük kayıtları.

## Faz 5 kararları (2026-11-25)

- Tek giriş: `services/notify.ts` olayı → `services/notifications.ts → deliver()`. Her olay bir `Notification` kaydı olur (listede görünür); push yalnızca ilgili ayar açıksa gider (`push.status`: pending/queued/sent/skipped/failed). `dedupeKey` (unique, kısmi index) aynı olayın iki kez bildirilmesini engeller.
- Sessiz saat yalnızca push'u erteler (`queued` + `sendAfter`); `notification-tick` işi (5 dk) sırayı boşaltır. Kayıt listede hemen görünür. Başlangıç = bitiş → sessiz saat yok.
- Push gönderimi `services/push.ts` (`expo-server-sdk`); testler `push.sender`'ı değiştirir. `DeviceNotRegistered` gelen token silinir. Expo makbuzları (receipts) sorgulanmıyor.
- Türler (4 renk): reminder (günlük, haftalık rapor, yerel blok hatırlatması), motivation, penalty, claude (Faz 6). Android kanalları `@takip/shared` → `NOTIFICATION_CHANNELS`; push ve yerel bildirim aynı kimlikleri kullanır.
- Motivasyon: şablon (`services/motivation.ts`), Claude API bağlanmadı. Az = 09:00, Orta = 09/13/19, Çok = 09:00 + her tamamlanan bloktan sonra (son 1 saatte `doneAt`). Saat penceresi 60 dk (sunucu kısa süre kapalı kalsa da gider).
- Günlük hatırlatması `journalReminder` saatinde, o günün günlüğü yazılmadıysa. Ceza süresi uyarısı bitişe 2 saat kala, `dueAt` başına bir kez; süresi zaten 2 saatten kısa verilen cezada gönderilmez.
- Haftalık rapor: pazar 21:00 (`weekly-report` işi) hesaplanır, `WeeklyReport`'a yazılır, push gider. `GET /reports/weekly/:isoWeek` (`2026-W48` ya da `latest`); bitmiş hafta önbellekten, süren hafta canlı. "latest" = pazar 21:00'den sonra bu hafta, öncesinde geçen hafta. Günlük hedeflerde değer haftanın günlük ortalamasıdır.
- Yerel blok hatırlatmaları cihazda planlanır (`src/notifications/reminders.ts`, plan `@takip/shared → planBlockReminders`): önümüzdeki 7 gün, en çok 40, açılışta / ön plana gelince / her başarılı mutasyondan sonra baştan kurulur. Ayarlar → Blok hatırlatmaları kapalıysa iptal edilir.
- Bildirime dokunma: push `data.url` (expo-router yolu) açılır ve kayıt okundu yapılır; soğuk açılış `getLastNotificationResponse` ile.
- Çıkış: cihaz token'ı silinir (`DELETE /devices`), blok hatırlatmaları iptal edilir.
- Ayarlar ekranının bildirim bölümü (4 anahtar, sıklık, sessiz saatler, günlük saati, test bildirimi) Faz 5'te yapıldı; Claude, ceza kuralları bağlantısı ve yedek Faz 6–7.
- `expo-dev-client` eklendi (development build için). Firebase/EAS adımları: `docs/BILDIRIM_KURULUMU.md`. `EAS_PROJECT_ID` ve `GOOGLE_SERVICES_JSON` ortamdan gelir.
- `POST /notifications/test`: gerçek akıştan (ayar hariç) bir motivasyon mesajı; Ayarlar'daki "Test bildirimi".

## Faz 7 kararları (2026-11-25, onay bekliyor)

- Güvenlik: `@fastify/helmet` (varsayılanlar), `@fastify/rate-limit` bellek içi (tek kopya): genel `RATE_LIMIT_MAX`/dk/IP (300), `/auth/login` ve `/auth/refresh` 10/dk, `/export` 5/dk, `/health` sınırsız. 429 ortak hata biçiminde (`RATE_LIMITED`). Testlerde rate limit kapalı; `buildApp({ rateLimit: true })` ile açılır.
- CORS: geliştirmede her köken; üretimde yalnızca `CORS_ORIGINS` (boşsa kapalı). `TRUST_PROXY=true` Coolify/Traefik arkasında.
- Log: pino `redact` (authorization, parola, token alanları); `/health` başarılı istekleri loglanmaz; MCP yolu maskesi duruyor. `bodyLimit` 256 KB.
- `GET /export`: kullanıcının bütün koleksiyonları (userId, __v, push durumu, parola özeti, refresh/cihaz token'ları hariç), `content-disposition` ile `takip-yedek-YYYY-MM-DD.json`. Mobil: `src/features/settings/backup.ts` (expo-file-system + expo-sharing; web'de indirme). İçe aktarma yok; asıl yedek Coolify'ın günlük MongoDB yedeği.
- Docker: `apps/api/Dockerfile` (çok aşamalı, node:22-alpine, `pnpm deploy --prod --legacy`, root olmayan `node` kullanıcısı, HEALTHCHECK). Build bağlamı repo kökü; `.dockerignore` mobil ve belgeleri dışarıda bırakır. Yerelde derlenip dev Mongo'ya bağlanarak denendi (~318 MB).
- Ayarlar ekranı tasarımdaki gibi tamamlandı (Claude satırı pasif, ceza kuralları bağlantısı, hafta başlangıcı sabit Pazartesi, Yedeği indir). Tema hâlâ cihazda (`themeStore`); sunucudaki `theme` alanı kullanılmıyor.
- EAS: `production` profili APK + `autoIncrement`; API adresi EAS ortam değişkeni `EXPO_PUBLIC_API_URL` (https). Adımlar: `docs/DAGITIM.md`.
- Testlerde mongodb-memory-server `launchTimeout` 60 sn (12 dosya paralel mongod açıyor).
