# Devir notu — Faz 3'e başlarken (2026-11-25)

Bu dosya yeni bir sohbette kaldığın yerden devam edebilmen için yazıldı. Sırayla oku:
1. `PROJE_CONTEXT.md`: ürünün tamamı, veri modeli, ceza motoru kuralları (bölüm 3), fazlar (bölüm 8).
2. `CLAUDE.md`: kısa kurallar ve notlar.
3. Bu dosya: şu ana kadar ne yapıldı, kod nerede, Faz 3'te tam olarak ne yapılacak.

Çalışma biçimi: kullanıcıyla Türkçe konuş. Her fazın sonunda çalıştırma komutlarını, test sonuçlarını ve "elle kontrol et" listesini ver, sonra dur. Kullanıcı "olur" deyince bir sonraki faza geç.

---

## 1. Durum

| Faz | Durum |
|---|---|
| 0 — İskelet | tamam |
| 1 — Veri ve program | tamam |
| 2 — Hedefler ve ilerleme | tamam (kullanıcı onayladı, Faz 3 istendi) |
| **3 — Cezalar** | **sırada** |

Son doğrulama (Faz 2 sonu): `pnpm test` → shared 25, api 40 test geçti. typecheck, lint ve prettier temiz. `expo export --platform android` ve `expo-doctor` (20/20) sorunsuz.
Mobil ekranlar hiçbir cihazda görsel olarak denenmedi (bağlı cihaz yok). Kullanıcı Expo Go ile kendisi test ediyor.
Proje bir git deposu değil (kullanıcıya `git init` önerildi, yanıt gelmedi).

## 2. Çalıştırma

```bash
pnpm install
pnpm db:up                              # MongoDB 8, 127.0.0.1:27018 (27017 makinede başka projede dolu)
pnpm --filter @takip/api seed:demo      # 9 blok + 4 hedef + 8 haftalık örnek ilerleme (idempotent)
pnpm dev:api                            # http://localhost:3000/health ; shared paketi önce derlenir
pnpm dev:mobile                         # Expo Go; API adresi apps/mobile/.env → EXPO_PUBLIC_API_URL
pnpm test | pnpm typecheck | pnpm lint | pnpm format:check
```
Giriş: `admin@example.com` / `change-me-dev-password` (kök `.env` dosyasında; `.env.example` yalnızca örnek değer içerir).

## 3. Mimari ve kod haritası

### Monorepo
- pnpm 12 workspaces: `apps/api` (`@takip/api`), `apps/mobile` (`@takip/mobile`), `packages/shared` (`@takip/shared`).
- `packages/shared` `dist/` olarak tüketilir. API ve mobil, değişiklikleri görmek için önce `pnpm build:shared` ister. `dev:api`, `dev:mobile` ve `test` komutları bunu kendisi yapar.
- pnpm 12'de kurulum betikleri onay ister: `pnpm-workspace.yaml` → `allowBuilds` (argon2, esbuild, mongodb-memory-server). Yeni yerel modül eklersen `pnpm approve-builds <paket>` çalıştır.
- TypeScript 6.0.3 strict ve `noUncheckedIndexedAccess`. ESLint flat config (`consistent-type-imports` hata verir; `react-hooks` eklentisi **yok**, `eslint-disable react-hooks/...` yazma). Prettier: tek tırnak, satır genişliği 100.

### Ortak paket (`packages/shared/src`)
- `constants.ts`: kategoriler, birimler, periyot etiketleri, `UNIT_INPUT` (−/+ adımları), `FOCUS_LEVELS`.
- `time.ts`: saat dilimi yardımcıları; hepsi yerel gün string'i (`YYYY-MM-DD`) ile çalışır. `localDateOf`, `localTimeOf`, `zonedDateTimeToUtc`, `weekStartOf`, `addDays`, `periodBounds`, `nextPeriodStart`, `isoWeekNumber`, `daysBetween`, `monthEndOf`…
- `tr.ts`: `withPossessive(n)` ("2'si", "3'ü"), `formatNumber` (tr-TR).
- `schemas/*`: zod şemaları ve DTO tipleri (auth, block, schedule, goal, progress, stats). API ve mobil aynı şemaları kullanır.

### API (`apps/api/src`)
- `app.ts`: Fastify. `/health` hem kökte hem `/api/v1` altında. `/api/v1/auth/*` açık; diğer her şey `requireAuth` kapsamında (`plugins/auth.ts` → `req.user = { id, timezone }`).
- Hata biçimi `lib/errors.ts`: `AppError(status, code, mesajTR, details?)`. ZodError otomatik olarak 400 `VALIDATION_ERROR` döner.
- **Servis katmanı** (`services/`): REST ve ileride MCP aynı fonksiyonları çağırır, iş mantığı route içinde yazılmaz.
  - `clock.ts`: `clock.now()`. **Tüm zaman hesapları buradan alınır**; testler `setNow()` ile zamanı sabitler. `Block` modelinin timestamp'leri de `clock`'u kullanır.
  - `schedule.ts`: `ensureWeek` (idempotent; geçmiş günlere ve bloğun oluşturulduğu andan önceki saatlere kayıt üretmez), `regenerateFuture`, `generateForNewBlock`.
  - `blocks.ts`, `goals.ts`, `progress.ts`, `instances.ts` (done/undo/skip + atlama hakkı + bloktan otomatik ProgressLog), `views.ts` (today, week, blok geçmişi), `stats.ts` (aggregation: hedef özetleri, geçmiş, seriler, overview), `auth.ts` (JWT ve refresh rotation), `users.ts` (seed, ayarlar).
- Modeller (`db/models/`): User, Settings, RefreshToken, Block, BlockInstance, Goal, ProgressLog. **PenaltyRule ve Penalty henüz yok.**
- Testler (`apps/api/test/`): vitest ve mongodb-memory-server. `helpers.ts` → `startDb`, `resetDb`, `createUser`, `setNow`, `makeApp`, `loginToken`. Desen: `beforeAll(startDb)`, `beforeEach(resetDb + createUser)`, `afterEach(resetClock)`.

### Mobil (`apps/mobile`)
- Expo SDK 58 ve expo-router. **Rotalar `app/` altında** (src/app değil). Korumalı rotalar `app/_layout.tsx` içinde `Stack.Protected`; **yeni her rotayı buraya ekle.**
- Tipli rotalar: yeni rota ekledikten sonra typecheck "route not assignable" hatası verirse tipleri yeniden üretmek için `cd apps/mobile && CI=1 timeout 40 npx expo start` çalıştır.
- Paket eklerken: `npx expo install <paket>` (bkz. `apps/mobile/AGENTS.md`).
- Veri: `src/api/client.ts` (fetch; 401 gelince tek seferlik refresh; Türkçe `ApiError`), `src/api/hooks.ts` (TanStack Query; `keys` ve `invalidate*` yardımcıları; `useInstanceAction` iyimser güncelleme yapar).
- Tema: `src/theme/tokens.ts` (koyu/açık), `typography.ts` (`type.*`, `fonts.*`), `category.ts` (`categoryColor`).
- Bileşenler (`src/components`): Txt, Screen (sekme ekranları; 30 px başlık, üstte etiket), SubHeader (ek ekranlar; geri düğmesi), BottomBar (altta sabit kaydet), Button (primary / outline / danger / dangerSolid), Switch (52×32; `color` prop'u ile ceza rengi), Segmented, Field/Input, TimeField, DateField, ProgressBar, IconButton, icons (tasarımdaki SVG'ler: `PenaltyIcon` şimşek şeklinde), StateViews (Loading, ErrorCard, errorMessage).
- **Seçim alanları:** tasarımdaki `<select>` yerine çip satırı kullanılıyor (BlockForm, GoalForm örneklerine bak).
- `app/(tabs)/penalties.tsx` şu an yalnızca bir yer tutucu (`PlaceholderCard`).

### Tasarım dosyası
`python3 -I scripts/extract-design.py` → `design-extracted/NN-<ekran>.html` (git'e girmez). Her dosya ekranın inline-style şablonunu (`{{t.pen}}` = tema token'ı) ve örnek veriyi üreten JS'i içerir. Faz 3 için: `06-Cezalar.html`, `11-Ceza-kuralı-ekle.html`; ayrıca `00-Bugün.html` (ceza uyarısı), `02-Hedefler…` (ceza kuralı satırı), `01-Haftalık…` ("kaçarsa:" etiketi), `09-Blok-detayı.html` ("Kaçarsa" satırı), `07-Program-bloğu-ekle.html` ("Kaçırırsam ceza"), `10-Hedef-ekle.html` ("Tutmazsa ceza").

## 4. Bilinen kararlar ve tuzaklar

- **Gün hesabı:** gün ve hafta hesapları her zaman kullanıcının saat diliminde (`user.timezone`, Europe/Istanbul) yapılır, DB'de UTC tutulur. Yerel 00:00–03:00 arası UTC'de bir önceki güne düşer; bunun için test zaten var, yeni mantıkta da test yaz.
- **"Kaçırıldı" yorumu:** Faz 3'e kadar süresi geçmiş `planned` instance'lar iki yerde "kaçırılmış" sayılıyor: `stats.ts → completionByDay` ve `views.ts → getBlockHistory`. Ceza motoru `missed` durumunu yazmaya başlayınca bu yorumu **30 dakikalık tolerans ile uyumlu** hâle getir (ya kaldır ya da `endAt + 30 dk < now` yap) ve ilgili testleri güncelle.
- **İşaretleme kuralları:** `markDone`, `missed` bir instance'ı da `done` yapabilir; `skipped` bir instance önce geri alınmalıdır. Atlanan (`skipped`) blok cezaya sayılmaz.
- **Silme:** blok ve hedef silme aslında arşivlemedir.
- **Ceza alanları:** `Block.penaltyRuleId` ve `Goal.penaltyRuleId` modelde zaten var (ref `PenaltyRule`), şemalarda `nullable().optional()`. Şu an hiçbir yerde kullanılmıyor.
- **Bağlantı noktaları:** `Instance.penalty` DTO alanı (`lib/serialize.ts → toInstanceDto`) şimdilik sabit `null`; "kaçarsa: …" etiketi buradan dolacak. `/today` yanıtında `pendingPenalty: null` (`views.ts`). Şemalarda tipi `z.unknown()`; gerçek şemayla değiştir.
- **Bildirimler:** push ve Notification modeli Faz 5'te. Faz 3'te motorun bildirim göndereceği yerlere tek bir `notify(...)` boş fonksiyonu bırak.

## 5. Faz 3 — yapılacaklar

Kabul ölçütü (PROJE_CONTEXT §8): **Kaçırılan blok 30 dakika sonra ceza üretiyor; süresi geçen ceza iki katına çıkıyor; motor testleri geçiyor.** Ayrıca Cezalar ekranı ve Bugün'deki uyarı çalışmalı.

### 5.1 Veri (PROJE_CONTEXT §3'teki modeller)
- `PenaltyRule { userId, trigger: 'block_missed'|'goal_failed'|'penalty_postponed', targetType: 'block'|'goal'|'category'|'any', targetId?, category?, penalty: string, deadlineHours: 24, onFail: 'double'|'plus_one'|'reset_streak', enabled }`
- `Penalty { userId, ruleId, reason, sourceRef: { type, id }, penalty, multiplier, dueAt, status: 'pending'|'done'|'postponed'|'escalated', resolvedAt? }`
- **Unique index** `{ userId, ruleId, 'sourceRef.type', 'sourceRef.id' }`: aynı kaynak için iki ceza oluşmamalı. Motorun idempotent olmasının dayanağı bu.
- Önerilen `sourceRef` değerleri:
  - `{type:'instance', id: instanceId}`
  - `{type:'goal_period', id: \`${goalId}:${periodStart}\`}`
  - `{type:'penalty_postpone', id: penaltyId}`
  - `{type:'penalty_escalation', id: \`${penaltyId}:${n}\`}`
- Shared paket: kural ve ceza şemaları, ön tanımlı cezalar (`Soğuk duş → 3 dk soğuk duş`, `Şınav → 50 şınav`, `Ekstra iş → Ertesi gün +10 sayfa`, `Ekran yasağı → 1 gün sosyal medya yok`, `Telefonsuz → 2 saat telefonsuz`, `Erken kalk → Ertesi gün 06:00 kalk`), kural cümlesi üreten Türkçe yardımcı ("Spor bloğu kaçarsa → 24 saat içinde 3 dk soğuk duş. Yapmazsan iki katı.").

### 5.2 Ceza motoru (`services/penaltyEngine.ts`)
Saf, test edilebilir bir `runPenaltyEngine(now = clock.now())` yaz. Agenda yalnızca bunu her 15 dakikada bir çağırır. Testler motoru doğrudan çağırır, Agenda'ya bağlı değildir.
1. **Kaçırma:** `status:'planned'` ve `endAt + 30 dk <= now` olan instance'lar → `missed`. Her biri için uyan, açık `block_missed` kurallarına Penalty oluştur (`dueAt = now + deadlineHours`). Bir kural instance'a uyar, eğer: `block.penaltyRuleId` doğrudan o kuralsa **veya** `targetType:'block' && targetId === blockId`, **veya** `targetType:'category' && category === block.category`, **veya** `targetType:'any'`.
2. **Hedef periyot kapanışı** (günlük 00:05, haftalık pazartesi 00:05, aylık ayın 1'i): kapanmış ve henüz değerlendirilmemiş periyotlarda toplam `< target` ise `goal_failed` cezası. Unique `sourceRef` sayesinde "zaten değerlendirildi" kontrolü kendiliğinden olur. Periyot toplamı için `stats.ts → goalTotals` veya `dailySums` kullan. Yalnızca hedefin `startDate`'inden sonraki periyotları değerlendir.
3. **Yükseltme:** `dueAt < now` ve hâlâ `pending` (ya da `postponed`/`escalated` ve süresi geçmiş) olan cezalar için:
   - `double`: `multiplier ×2`, yeni `dueAt`.
   - `plus_one`: yeni bir Penalty.
   - `reset_streak`: ilgili seri sıfırlanır.
   - Sonra durum `escalated` olur ve `notify()` çağrılır.
4. **Erteleme** (`POST /penalties/:id/postpone`, tasarımda "Ertele (×2)"): multiplier ×2, `dueAt` uzar, durum `postponed`, ve `penalty_postponed` kuralları tetiklenir.
5. **Yapıldı** (`POST /penalties/:id/done`): durum `done`, `resolvedAt` yazılır.
6. **Agenda:** `jobs/` altında tanımla, `server.ts` içinde başlat, testte başlatma. Pazar 20:00'de bir sonraki hafta için `ensureWeek` de buraya eklenebilir. Tek API kopyası çalıştırılacak (PROJE_CONTEXT §9).
7. **Zorunlu motor testleri:** kaçırma (29. dakikada ceza yok, 31. dakikada var), atlanan blok için ceza yok, aynı motor iki kez çalışınca tek ceza, gece yarısı sınırı (23:30–00:15 bloğu ve 00:05 günlük kapanış), saat dilimi, `double` / `plus_one` yükseltme, erteleme zinciri, kapalı (`enabled:false`) kural ceza üretmez.

### 5.3 REST (PROJE_CONTEXT §4)
`GET /penalties?status=`, `POST /penalties/:id/done`, `POST /penalties/:id/postpone`, `GET/POST /penalty-rules`, `PATCH/DELETE /penalty-rules/:id`.
`/today.pendingPenalty`: en yakın süresi dolacak açık ceza (ceza, sebep, kalan süre). `toInstanceDto.penalty`: bloğa uyan ilk açık `block_missed` kuralının ceza metni.

### 5.4 Mobil
- **Cezalar sekmesi** (`06-Cezalar.html`):
  - Üst etiket "BU HAFTA · N BEKLİYOR · M YAPILDI".
  - Bekleyen ceza kartı: `penBg` zemin, `pen` çerçeve; "BEKLEYEN CEZA" ve canlı geri sayım `SS:dd:ss` (duvar saatine göre). Ceza metni 24 px. Sebep cümlesi. Düğmeler "Yaptım" (dolu `pen`) ve "Ertele (×2)" (çerçeveli).
  - Yaptım'dan sonra kart, yeşil çerçeveli "Ceza kapandı. Borcun yok — seri devam ediyor." kartına dönüşür.
  - Kurallar listesi: "ne olunca" (12 px soluk) / "ne olur" (15 px); anahtar `color={c.pen}`, kapalıyken metin soluk. "+ Kural" düğmesi.
  - Geçmiş: ne yapıldı, sebep, sağda "PAZ ✓" gibi mono etiket (`okTx`).
- **Ceza kuralı ekle** (`penalties/rules/new`, `11-Ceza-kuralı-ekle.html`):
  - "Ne olunca?" segmented: Blok kaçınca / Hedef tutmayınca / Ertelenince.
  - Hangi blok / hedef / ceza seçimi (çip satırı).
  - Ceza çipleri; seçili olan `pen` dolgulu ve beyaz yazılı.
  - "Ayrıntı" metin alanı (seçilen ön tanımlı cezanın metniyle dolar, düzenlenebilir).
  - "Yapma süresi" (24 saat / 48 saat / Hafta sonuna kadar) ve "Yapmazsam" (İki katı / +1 ceza / Seri sıfırlanır).
  - `penBg` kutusunda "KURAL" önizleme cümlesi. Altta "Kuralı kaydet".
- **Bugün:** başlığın altında `penBg` uyarı kartı (`00-Bugün.html`): şimşek ikonu, "Bekleyen ceza: 3 dk soğuk duş", altında "Dün Almanca bloğu kaçtı · 14 sa kaldı", sağda "Aç". Dokununca Cezalar sekmesi açılır.
- **Bağlantılar:**
  - BlockForm'a "Kaçırırsam ceza" (çerçeve `pen` rengi).
  - GoalForm'a "Tutmazsa ceza".
  - Hafta kartında "kaçarsa: …" etiketi (`WeekBlockCard` hazır, `item.penalty` dolunca görünür).
  - Blok detayına "Kaçarsa" satırı (`penBg` hap).
  - Hedefler ekranına seçili hedefin ceza kuralı satırı (şimşek + metin, Cezalar'a bağlantı).
- **Hook'lar:** `usePenalties`, `usePenaltyRules`, mutasyonlar. Ceza değişince `today` ve `penalties` sorgularını yenile.

### 5.5 Kullanıcıya sorulacak / kararı belgelenecek noktalar
1. **Agenda paketi:** PROJE_CONTEXT'te adı geçiyor, yani onaylı yığının parçası. Kurmadan önce güncel paketin (`agenda` ve bakımı süren fork'lar) MongoDB 8 ve mongoose 9 ile uyumunu kontrol et. Farklı bir paket seçeceksen gerekçesini yazıp onay iste.
2. **"Hafta sonuna kadar" süresi:** `deadlineHours` sayısal bir alan. Ya pazar 23:59'a kadar kalan saat kural oluşturulurken değil ceza oluşturulurken hesaplanmalı (bunun için `deadlineMode` gibi ek bir alan gerekir), ya da bu seçenek kaldırılmalı. Öneri: `deadline: { type:'hours', hours } | { type:'end_of_week' }`.
3. **Geç işaretleme:** kaçırılmış (`missed`) blok sonradan "yapıldı" işaretlenirse bekleyen ceza ne olacak? Öneri: ceza kalır; bu kullanıcıya sorulmalı.
4. **`reset_streak` uygulaması:** seriler şu an veriden hesaplanıyor (`stats.goalStreak`). Sıfırlamak için Goal'a `streakResetAt` alanı ekleyip seriyi bu tarihten sonra saymayı öner.
5. **Mevcut demo kuralları:** `seed:demo`'ya tasarımdaki 5 örnek kural eklensin mi?

## 6. Sonraki fazlar (kısaca)
- **Faz 4:** dağ tırmanışı odak sayacı (duvar saati, AppState ile arka plan tespiti), FocusSession API'si, Odak bitti ekranı, Günlük ve takvim. Odak süresi `stats.timeSplit`'e eklenecek.
- **Faz 5:** push (Firebase ve development build), Notification modeli, sessiz saatler, motivasyon mesajları (`views.noteFor` şimdilik basit şablon), haftalık rapor.
- **Faz 6:** MCP (`/mcp/<MCP_SECRET>`), AuditLog, PendingChange onay akışı. Araçlar mevcut servis fonksiyonlarını çağıracak.
- **Faz 7:** Dockerfile, Coolify, rate limit, helmet, Ayarlar ekranı, dışa aktarma, EAS release.
