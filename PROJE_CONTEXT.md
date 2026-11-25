# PROJE CONTEXT — Kişisel Takip Uygulaması (Android + API + MCP)

> Yapay zekâ asistanına ilk mesaj: "PROJE_CONTEXT.md'yi oku, Faz 0'dan başla. Her fazın sonunda dur ve bana kontrol listesini göster."
> Ekran ayrıntıları için `tasarım_dokumani.md` ve `Kişisel Takip Uygulaması — Mobil Tasarım.html` dosyalarına bak.

## 0. Senin rolün

Kıdemli bir full-stack geliştiricisin. Tek kullanıcılı, kişisel bir takip uygulamasını sıfırdan kuracaksın:

- **Android uygulaması:** React Native (Expo)
- **Backend API:** Node.js + TypeScript
- **MCP sunucusu:** Backend ile aynı süreçte çalışacak. Kullanıcı bunu claude.ai'ye "özel bağlayıcı" olarak ekleyip programını Claude'a sohbetle düzenletecek.
- **Veritabanı:** MongoDB
- **Dağıtım:** Kullanıcının VPS'indeki Coolify. API ve MongoDB aynı sunucuda, aynı Coolify projesinde çalışacak.

Çalışma kuralları:

- Kod, değişken ve dosya adları İngilizce olacak. Uygulamada görünen tüm metinler Türkçe olacak.
- TypeScript strict açık olacak. Dışarıdan gelen her girdi (HTTP gövdesi, MCP aracı parametresi, ortam değişkeni) zod ile doğrulanacak.
- Büyük bir bağımlılık eklemeden önce gerekçesini yaz ve onay iste.
- Her fazın sonunda: çalıştırma komutları, test sonuçları ve "elle kontrol et" listesi ver, sonra dur.
- Gizli anahtarları asla koda yazma; `.env.example` dosyasında yalnızca örnek değerler olsun.
- Saat dilimi Europe/Istanbul, hafta pazartesi başlar. Veritabanında tarihler UTC olarak saklanır; gün ve hafta hesapları kullanıcının saat diliminde yapılır.

## 1. Ürün özeti

Kullanıcı haftalık bir program tutar ("Salı 07:00–08:00 Bisiklet 25 km"). Hedefleri vardır ("haftada 150 km bisiklet", "günde 20 sayfa kitap", "haftada 75 Almanca kelime", "haftada 15 saat odak"). İlerlemesini girer ve geçmiş istatistiklerine bakar. Günlük yazar. Odak sayacı kullanır. Kaçırdığı bloklar ve tutmayan hedefler için kendi belirlediği cezalar oluşur (örneğin "3 dk soğuk duş"). Bildirimler ve motivasyon mesajları alır. Claude, MCP üzerinden programı okuyup değiştirebilir; bazı değişiklikler kullanıcının onayını bekler.

### Ekranlar (tasarım hazır, birebir uygulanacak)

| Ekran | Dosya / rota | İçerik |
|---|---|---|
| Bugün | `(tabs)/index` | Selamlama, seri, bekleyen ceza uyarısı, günün notu, 3 hedef kartı, günün blokları (işaretlenebilir), "+ İlerleme gir", Claude'un son değişikliği |
| Hafta | `(tabs)/week` | 7 günlük şerit (her günün yükü renkli çizgilerle), seçili günün blokları, her blokta "kaçarsa: …" etiketi |
| Odak | `(tabs)/focus` | Dağ tırmanışı figürü (aşağıda), 25/50/90 dk, başlat/duraklat/sıfırla, haftalık zirveler |
| Hedefler | `(tabs)/goals` | Hedef kartları, seçili hedefin son 8 haftası, hedef çizgisi, ceza kuralı, rapor kartı |
| Cezalar | `(tabs)/penalties` | Bekleyen ceza (geri sayım, Yaptım / Ertele ×2), kurallar (aç/kapat), geçmiş |
| Günlük | `(tabs)/journal` | Ruh hâli (5 seviye), 3 kısa soru, günün istatistik çipleri, önceki günler |
| İlerleme gir | `progress/new` | Hedef seçimi, miktar (+/−, hızlı +5/+10/+25), "92 → 117 / 150" önizlemesi |
| İlerleme | `progress/index` | Hafta / 12 hafta / Yıl; genel %, eğilim çizgisi, 12 haftalık ısı haritası, toplamlar, seriler, zaman dağılımı |
| Blok ekle / düzenle | `blocks/new`, `blocks/[id]/edit` | Ad, kategori, günler (çoklu), başlangıç-bitiş saati, haftalık tekrar, hedefe say + miktar, ceza, hatırlatma |
| Blok detayı | `blocks/[id]` | Bilgiler, son 6 hafta, "bu hafta atla" (haftada 1 hak), sil (onaylı) |
| Hedef ekle | `goals/new` | Ad, miktar, birim, günlük/haftalık/aylık, başlangıç, ceza, seri |
| Ceza kuralı ekle | `penalties/rules/new` | Tetikleyici (blok kaçınca / hedef tutmayınca / ertelenince), ceza, süre, yapılmazsa ne olacağı |
| Haftalık rapor | `reports/[week]` | Haftanın yüzdesi, gün grafiği, hedef sonuçları, cezalar, haftanın notu |
| Bildirimler | `notifications` | Bugün/dün gruplu liste; türler: hatırlatma, motivasyon, ceza, Claude değişikliği |
| Odak bitti | `focus/done` | Not, kaç kez bölündüğü, haftalık odağa eklenen süre |
| Günlük takvimi | `journal/calendar` | Ay görünümü, günler ruh hâline göre renkli |
| Ayarlar | `settings` | Bildirim türleri, motivasyon sıklığı, sessiz saatler, tema, MCP, yedek indirme |
| Claude bağlantısı | `claude` | MCP adresi, durum, Claude'un yaptığı değişiklikler (geri al), izinler, araç listesi |
| Claude onayı | `claude/pending/[id]` | Onay bekleyen değişiklik, öncesi/sonrası, Onayla / Reddet |
| MCP koptu | `claude` ekranının hata durumu | Kontrol listesi, yeniden bağlan |
| İlk açılış | `onboarding` | 4 adım: hedef koy, program kur, Claude'u bağla, ceza kuralı seç |

Alt menüde 6 sekme var: Bugün, Hafta, Odak, Hedef, Ceza, Günlük.

### Tasarım dili

- **Fontlar:** Space Grotesk (başlıklar), Inter (gövde), JetBrains Mono (sayılar, saatler, etiketler). expo-font ile yüklenecek.
- Tek vurgu rengi amber. Kategori renkleri: Proje = amber, Spor = yeşil, Dil = mavi, Okuma = bej.
- Emoji yok. İkonlar ince çizgili (lucide-react-native). Dokunma alanı en az 44 dp.
- Tema: koyu (varsayılan), açık, sistem.

```ts
// src/theme/tokens.ts
export const themes = {
  dark:  { bg:'#0E1116', s1:'#161B22', s2:'#1E242D', line:'#2A313B', line2:'#3A424E', nav:'#0B0E12',
           tx:'#ECE8E1', tx2:'#C9CDD3', mut:'#9AA3AE', acc:'#F0A63A', accTx:'#F0A63A', accDim:'#8A6430',
           onAcc:'#0E1116', inv:'#ECE8E1', onInv:'#0E1116', ok:'#5BB5A2', okTx:'#5BB5A2',
           pen:'#E0735A', penTx:'#EE8A73', penBg:'#2A1A17', dil:'#8FA7FF', oku:'#E7D7B8' },
  light: { bg:'#F4F2ED', s1:'#FFFFFF', s2:'#ECE9E2', line:'#DEDAD1', line2:'#BDB7AB', nav:'#FBFAF7',
           tx:'#16181C', tx2:'#3A3F47', mut:'#5C636D', acc:'#F0A63A', accTx:'#9A5A06', accDim:'#F4CF97',
           onAcc:'#16181C', inv:'#16181C', onInv:'#F4F2ED', ok:'#3E9A86', okTx:'#24705F',
           pen:'#D0573C', penTx:'#A8402A', penBg:'#FBEAE5', dil:'#6F8CF0', oku:'#C9AE7E' },
} as const;
// radius: kart 14-16, buton 22-28 (hap şekli), input 12. Boşluk ölçeği: 4/6/8/10/12/14/16/18/20.
```

### Odak figürü: dağ tırmanışı

- react-native-svg ile çizilir: arkada sıra dağlar, önde ana dağ, zirvede kar, zikzak patika.
- Patika iki katmanlıdır: altta kesikli tam patika, üstte ilerleme kadar dolan amber çizgi (`strokeDasharray = L`, `strokeDashoffset = L*(1-p)`). İşaretçi, patika üzerinde p oranındaki noktada durur.
- Seans süresi dağın boyunu belirler: 25 dk = Tepe (1.200 m), 50 dk = Dağ (2.500 m), 90 dk = Zirve (4.100 m). Ekranda "950 / 2.500 m" gösterilir.
- Süre bitince zirveye bayrak dikilir. Haftalık zirveler, yüksekliği süreyle orantılı üçgenler olarak dizilir.
- Süre hesabı duvar saatine göre yapılır (startedAt + duraklama toplamı), setInterval sayacına göre değil. Uygulama arka plana geçince süre doğru kalmalı.
- Seans sırasında uygulamadan çıkılırsa (AppState → background, 10 saniyeden uzun) seans interrupted sayılır ve sayaç ekranında bu belirtilir.
- Seans sırasında bitiş zamanı için yerel bildirim planlanır.

## 2. Teknoloji yığını

### Mobil (`apps/mobile`)

- Expo SDK (en güncel kararlı sürüm), TypeScript, expo-router (dosya tabanlı yönlendirme)
- TanStack Query (sunucu verisi, önbellek, iyimser güncelleme) ve Zustand (arayüz durumu: tema, odak sayacı)
- react-native-svg (dağ, grafikler, ısı haritası), react-native-reanimated (geçişler)
- expo-notifications (push ve yerel bildirim), expo-secure-store (tokenlar), expo-font, expo-haptics
- react-hook-form + zod (formlar)
- Build: EAS Build ile Android APK/AAB. Bildirimler için Expo Go yerine development build kullanılacak.

### Backend (`apps/api`)

- Node.js 22 LTS, TypeScript, Fastify
- Mongoose (MongoDB ODM), zod (doğrulama; zod-to-json-schema ile MCP şemalarına da kullanılacak)
- @modelcontextprotocol/sdk: Streamable HTTP transport, `/mcp` yolunda
- Agenda (MongoDB tabanlı zamanlanmış işler: ceza motoru, bildirimler, haftalık rapor)
- expo-server-sdk (push gönderimi), argon2 (şifre), jose (JWT), pino (log)
- Test: vitest ve mongodb-memory-server

### Ortak paket (`packages/shared`)

zod şemaları ve TypeScript tipleri. Mobil ve API aynı şemaları kullanır.

### Monorepo

pnpm workspaces. Kökte `pnpm dev:api`, `pnpm dev:mobile`, `pnpm test` komutları.

```
takip/
├─ apps/
│  ├─ mobile/
│  │  ├─ app/                 # expo-router rotaları (bölüm 1'deki tablo)
│  │  ├─ src/
│  │  │  ├─ api/              # fetch istemcisi + TanStack Query hook'ları
│  │  │  ├─ components/       # Card, Pill, Switch, Segmented, BlockRow, GoalCard, MountainClimb, Heatmap...
│  │  │  ├─ features/         # focus/, penalties/, progress/ (ekran mantığı)
│  │  │  ├─ notifications/    # izin, token kaydı, yerel planlama
│  │  │  ├─ store/            # zustand
│  │  │  └─ theme/            # tokens.ts, ThemeProvider, tipografi
│  │  ├─ app.config.ts
│  │  └─ eas.json
│  └─ api/
│     ├─ src/
│     │  ├─ config/env.ts     # zod ile env doğrulama
│     │  ├─ db/               # mongoose bağlantısı + modeller
│     │  ├─ modules/          # auth, blocks, goals, progress, penalties, journal, focus, notifications, reports, audit, settings
│     │  ├─ mcp/              # server.ts, tools/*.ts, auth.ts
│     │  ├─ jobs/             # agenda tanımları
│     │  ├─ services/         # schedule (hafta üretimi), penaltyEngine, stats, motivation, push
│     │  └─ server.ts
│     ├─ test/
│     └─ Dockerfile
├─ packages/shared/src/       # schemas/*.ts, types.ts, constants.ts
├─ .env.example
└─ PROJE_CONTEXT.md
```

## 3. Veri modeli (MongoDB koleksiyonları)

Tek kullanıcı olsa da her belgede `userId` bulunur (ileride çok kullanıcıya geçiş kolay olsun). Bütün koleksiyonlarda `createdAt` ve `updatedAt` vardır.

```ts
User          { email, passwordHash, timezone:'Europe/Istanbul', weekStart:1 }
Settings      { userId, theme:'dark'|'light'|'system', notif:{ blocks, motivation, penalties, journal:boolean },
                motivationFreq:'low'|'mid'|'high', quietHours:{ start:'00:00', end:'06:30' },
                journalReminder:'23:00', skipAllowancePerWeek:1,
                mcpPermissions:{ blockWrite:'auto'|'approve', blockDelete:'auto'|'approve',
                                 penaltyRuleWrite:'auto'|'approve', journalRead:boolean } }

Goal          { userId, name, unit:'km'|'sayfa'|'kelime'|'saat'|'dakika'|'adet', target:number,
                period:'daily'|'weekly'|'monthly', startDate, penaltyRuleId?, trackStreak:boolean,
                category:'project'|'sport'|'language'|'reading'|'other', archived:boolean }

Block         { userId, title, category, daysOfWeek:number[] /*1=Pzt..7=Paz*/, startTime:'07:00', endTime:'08:00',
                repeatWeekly:boolean, validFrom, validTo?, goalId?, goalAmount?, penaltyRuleId?,
                reminderMinutes:number|null, archived:boolean }

BlockInstance { userId, blockId, date:'2026-11-25' /*yerel gün*/, startAt, endAt /*UTC*/,
                status:'planned'|'done'|'missed'|'skipped', doneAt?, progressLogId?, overrides?:{ title?, startTime?, endTime? } }
                // index: { userId, date }, unique { blockId, date }

ProgressLog   { userId, goalId, amount, date /*yerel gün*/, source:'app'|'mcp'|'block'|'focus', note? }

PenaltyRule   { userId, trigger:'block_missed'|'goal_failed'|'penalty_postponed', targetType:'block'|'goal'|'category'|'any',
                targetId?, category?, penalty:string /*"3 dk soğuk duş"*/,
                deadline:{ type:'hours', hours } | { type:'end_of_week' } /*Faz 3 kararı; eski adı deadlineHours*/,
                onFail:'double'|'plus_one'|'reset_streak', enabled:boolean }

Penalty       { userId, ruleId, reason:string, sourceRef:{ type, id }, penalty:string, multiplier:number,
                dueAt, status:'pending'|'done'|'postponed'|'escalated', resolvedAt?,
                onFail, deadline /*oluştuğu andaki kural ayarı*/, goalId? /*reset_streak için*/, escalations, postponements }
                /* unique { userId, ruleId, sourceRef.type, sourceRef.id } */

JournalEntry  { userId, date /*unique userId+date*/, mood:0..4, wentWell?, hard?, tomorrowOne? /*en çok 1000 karakter*/ }
FocusSession  { userId, label, plannedMinutes:25|50|90, date /*startedAt'in yerel günü*/, startedAt, endedAt?, pausedMs, pausedAt?,
                status:'running'|'paused'|'completed'|'interrupted'|'abandoned',
                interruptions:0|1|2|3, backgroundMs, note?, goalId? /*Odak hedefi*/, progressLogId? /*hedefe yazılan kayıt*/ }
                // partial unique { userId } where status ∈ {running, paused}: aynı anda tek açık seans
Notification  { userId, type:'reminder'|'motivation'|'penalty'|'claude', title, body, deepLink, readAt?, sentAt }
DeviceToken   { userId, expoPushToken, platform:'android', lastSeenAt }

AuditLog      { userId, actor:'app'|'mcp'|'system', tool?, entity, entityId, before, after, undoneAt? }
PendingChange { userId, tool, args, preview:{ title, lines[] }, status:'pending'|'approved'|'rejected'|'expired',
                expiresAt, decidedAt? }
```

### Haftalık program mantığı

- Block bir kuraldır. BlockInstance o kuralın belirli bir güne düşen gerçek kaydıdır.
- `services/schedule.ensureWeek(userId, weekStart)`: o haftanın instance'larını kurallardan üretir. İşlem idempotenttir; aynı hafta için tekrar çağrılırsa kopya üretmez. Pazar 20:00'de bir sonraki hafta için otomatik çalışır; ayrıca haftalık bir ekran açıldığında da çağrılır.
- Bir blok düzenlenince gelecekteki planned instance'lar yeniden üretilir. Geçmiş kayıtlara dokunulmaz.
- "Bu hafta atla" → instance skipped olur. Haftalık hak (`skipAllowancePerWeek`) aşılırsa işlem reddedilir.
- Hedefe bağlı bir blok done yapılınca otomatik olarak ProgressLog (miktar `goalAmount`) oluşur. Blok geri alınınca bu kayıt da silinir.

### Ceza motoru (`services/penaltyEngine`) — Agenda ile 15 dakikada bir çalışır

1. `endAt + 30 dk` geçmiş ve hâlâ planned olan instance'lar missed yapılır. Bunlara uyan, açık (enabled) `block_missed` kuralları için Penalty oluşturulur (`dueAt = now + deadlineHours`). Ardından push gönderilir.
2. Periyot kapanışında (günlük hedefler için gece 00:05, haftalık için pazartesi 00:05, aylık için ayın ilk günü) hedef toplamı target değerinin altındaysa `goal_failed` cezası oluşur.
3. `dueAt` geçmiş ve hâlâ pending olan cezalara `onFail` uygulanır: `double` ise multiplier ×2 ve yeni süre; `plus_one` ise yeni bir ceza; `reset_streak` ise ilgili seri sıfırlanır. Durum escalated olur ve push gönderilir.
4. Ceza ertelenince `penalty_postponed` kuralları tetiklenir.
5. Motor idempotent olmalı: aynı kaynak (sourceRef) için iki ceza oluşmamalı (unique index).
6. Bu servisin birim testleri zorunlu: kaçırma, atlama hakkı, gece yarısı sınırı, saat dilimi, ceza yükseltme.

### İstatistikler (`services/stats`)

MongoDB aggregation ile hesaplanır:

- Hedef bazında günlük, haftalık ve aylık toplamlar; hedefin tuttuğu ve kaçtığı periyotlar.
- Genel tamamlama oranı: `done / (done + missed)`. skipped olanlar hesaba katılmaz.
- 84 günlük ısı haritası: her gün için 0–4 seviye.
- Seriler: şu anki seri ve en iyi seri (günlük hedefler için gün, haftalık hedefler için hafta).
- Kategoriye göre zaman dağılımı: done instance süreleri ile tamamlanan odak süresi.
- Haftalık rapor her pazar 21:00'de hesaplanıp önbelleğe alınır ve push gönderilir.

## 4. REST API (mobil uygulama için)

Tüm uç noktalar `/api/v1` altındadır ve `Authorization: Bearer <accessToken>` ister (`/auth/*` ve `/health` hariç).

```
POST   /auth/login            { email, password } → { accessToken (15 dk), refreshToken (30 gün) }
POST   /auth/refresh          POST /auth/logout
GET    /health                → { ok, db, time }

GET    /today                 → bugünün instance'ları, hedef özetleri, bekleyen ceza, günün notu, son Claude değişikliği
GET    /week?start=YYYY-MM-DD → 7 gün × instance'lar
POST   /instances/:id/done    POST /instances/:id/undo    POST /instances/:id/skip

GET/POST        /blocks       GET/PATCH/DELETE /blocks/:id     GET /blocks/:id/history?weeks=6
GET/POST        /goals        GET/PATCH/DELETE /goals/:id      GET /goals/:id/history?periods=8
POST   /progress              { goalId, amount, date?, note? }   DELETE /progress/:id

GET    /penalties?status=     POST /penalties/:id/done   POST /penalties/:id/postpone
GET/POST        /penalty-rules   PATCH/DELETE /penalty-rules/:id

GET    /journal?month=YYYY-MM   GET/PUT /journal/:date (GET: kayıt + günün istatistikleri)   GET /journal/recent?before=&limit=
POST   /focus/start  POST /focus/:id/pause  POST /focus/:id/resume  POST /focus/:id/finish  POST /focus/:id/abandon
POST   /focus/:id/interrupt   { backgroundMs } → bölünme sayılır, seans sürer | { end: true } → interrupted (çıkış)
GET    /focus/week   GET /focus/active   GET /focus/labels

GET    /stats/overview?range=week|12w|year
GET    /reports/weekly/:isoWeek

GET    /notifications   POST /notifications/read-all
POST   /devices         { expoPushToken }

GET    /audit?actor=mcp&limit=   POST /audit/:id/undo
GET    /pending-changes          POST /pending-changes/:id/approve   POST /pending-changes/:id/reject

GET/PATCH /settings
GET    /export                → bütün verilerin JSON yedeği
```

Hata biçimi her yerde aynı: `{ error: { code, message, details? } }`. Mesajlar Türkçe.

## 5. MCP sunucusu (Claude bağlantısı)

- @modelcontextprotocol/sdk ile Streamable HTTP transport kullanılır. Uç nokta: `https://takip.<alan-adı>/mcp/...`
- claude.ai'deki özel bağlayıcılar internetten erişilebilen, HTTPS'li uzak bir sunucu ister. Yerelde çalışan (stdio) bir sunucu eklenemez.
- Araçlar REST ile aynı servis katmanını kullanır. MCP için iş mantığı ayrıca yazılmaz.
- Her araç çağrısı AuditLog'a `actor:'mcp'` olarak yazılır.

### Kimlik doğrulama (iki aşamalı plan)

- **Aşama 1 (MVP):** Uç nokta yolunda tahmin edilemeyen gizli bir anahtar bulunur: `/mcp/<MCP_SECRET>`. En az 32 baytlık rastgele değer olmalı. Değer .env'den gelir, loglara yazılmaz, sabit zamanlı karşılaştırılır. Yanlış istek için 404 döner. Kullanıcı Ayarlar'dan anahtarı yenileyebilir.
- **Aşama 2:** MCP yetkilendirme spesifikasyonuna uygun OAuth 2.1 (PKCE, Dynamic Client Registration, `/.well-known/oauth-authorization-server` ve `/.well-known/oauth-protected-resource`). Onay sayfası API'nin kendi giriş ekranı olur. Bu aşamaya geçmeden önce MCP spesifikasyonunun güncel sürümünü kontrol et.
- Aşama 1, adresi bilen herkese erişim verir. Adresi paylaşma; sızarsa hemen yenile.

### Araçlar

Her aracın açıklaması Türkçe ve net olmalı; Claude aracı bu açıklamaya göre seçer. Parametreler zod şemasından üretilir.

| Araç | Parametreler | Not |
|---|---|---|
| `get_today` | — | Bugünün blokları, hedef durumları, bekleyen cezalar |
| `get_week` | `weekStart?` | 7 gün × bloklar ve durumları |
| `add_block` | `title, category, daysOfWeek[], startTime, endTime, repeatWeekly, goalId?, goalAmount?, penaltyRuleId?, reminderMinutes?` | İzin approve ise PendingChange oluşturur |
| `update_block` | `blockId, scope:'this_week'\|'future', changes{...}` | |
| `delete_block` | `blockId, scope:'this_week'\|'future'` | |
| `log_progress` | `goalId\|goalName, amount, date?, note?` | |
| `get_stats` | `range:'week'\|'12w'\|'year'` | |
| `list_goals` / `set_goal` | `goalId?, name, target, unit, period` | |
| `list_penalties` | `status?` | |
| `add_penalty_rule` / `update_penalty_rule` | kural alanları | İzin approve ise PendingChange oluşturur |
| `resolve_penalty` | `penaltyId, action:'done'\|'postpone'` | |
| `write_journal` | `date?, mood?, wentWell?, hard?, tomorrowOne?` | |
| `get_journal` | `from, to` | Yalnızca journalRead izni açıksa |
| `undo_last_change` | `auditId?` | |

### Onay akışı

1. Araç, izni approve olan bir işlem için değişikliği uygulamaz. Bunun yerine PendingChange kaydı oluşturur (süresi 24 saat).
2. Claude'a şu yanıtı döner: "Değişiklik kullanıcı onayı bekliyor (id: …). Kullanıcı telefondan onayladığında uygulanacak."
3. Telefona claude türünde bir push gider. Bildirim derin bağlantıyla `claude/pending/[id]` ekranını açar.
4. Kullanıcı Onayla derse servis değişikliği uygular, AuditLog'a yazar ve kaydın durumu approved olur. Reddet derse durum rejected olur.
5. Claude daha sonra get_week ya da get_today çağırdığında güncel durumu görür.

## 6. Bildirimler

- **Yerel bildirimler** (cihazda planlanır): blok hatırlatmaları (reminderMinutes önce) ve odak seansının bitişi. Uygulama açıldığında ve hafta değiştiğinde önümüzdeki 7 günün hatırlatmaları yeniden planlanır. Android'in planlı bildirim sınırını aşmamaya dikkat et.
- **Sunucu push'u** (Expo Push Service üzerinden FCM): ceza geldi veya yükseldi, ceza süresinin bitmesine 2 saat kaldı, motivasyon mesajı, Claude değişikliği veya onay isteği, haftalık rapor, 23:00 günlük hatırlatması.
- Android'de Expo push için bir Firebase projesi, uygulamaya eklenen `google-services.json` ve EAS'a yüklenen FCM kimlik bilgisi gerekir. Kurulum adımlarını ayrıca yaz.
- Sessiz saatlerde push gönderilmez; mesaj sıraya alınır ve sessiz saat bitince gönderilir.
- Android bildirim kanalları: `reminders`, `penalties` (yüksek öncelik), `motivation` (düşük öncelik), `claude`.
- Motivasyon mesajları: `services/motivation` kullanıcının o anki durumuna göre şablondan üretir (örnek: "8 sayfa kaldı, 12 günlük serini bozma"). Sıklık ayara göre: az = günde 1, orta = günde 3, çok = her bloktan sonra. `ANTHROPIC_API_KEY` tanımlıysa mesaj Claude API ile de üretilebilir. Bu isteğe bağlıdır; varsayılan şablon kullanmaktır.

## 7. Coolify ile dağıtım (aynı VPS)

1. Coolify'da bir Project oluştur, ardından bir Environment (production).
2. **MongoDB:** Coolify'ın hazır MongoDB kaynağını ekle (sürüm 7 veya 8). Önemli kurallar:
   - Public port açılmayacak. API, Coolify'ın iç Docker ağı üzerinden bağlanır.
   - Root kullanıcıdan ayrı, yalnızca takip veritabanına readWrite yetkisi olan bir kullanıcı oluştur.
   - Coolify'ın zamanlanmış yedek özelliğini aç: günlük yedek, S3 uyumlu bir depoya. Yedekten geri yüklemeyi bir kez deneyip doğrula.
3. **API:** Git deposundan yeni uygulama ekle. Build Pack: Dockerfile, yol: `apps/api/Dockerfile`, build bağlamı repo kökü.
   - Dockerfile çok aşamalı olacak: node:22-alpine, pnpm, yalnızca API ve shared paketi derlenir, çalışma imajında yalnızca dist ve üretim bağımlılıkları bulunur, root olmayan kullanıcıyla çalışır.
   - Domain: `https://takip.<alan-adı>`. Coolify, Traefik ve Let's Encrypt ile sertifikayı otomatik alır. Port 3000.
   - Health check: `GET /health`.
   - Push sonrası otomatik deploy açık olsun (GitHub App veya webhook).
4. **Ortam değişkenleri** (`.env.example` dosyasında da olacak):

```
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://takip_app:<şifre>@<coolify-iç-servis-adı>:27017/takip?authSource=takip
JWT_ACCESS_SECRET=<rastgele 64 bayt>
JWT_REFRESH_SECRET=<rastgele 64 bayt>
MCP_SECRET=<rastgele 32+ bayt, url-safe>
APP_TIMEZONE=Europe/Istanbul
EXPO_ACCESS_TOKEN=<isteğe bağlı, push güvenliği için>
ANTHROPIC_API_KEY=<isteğe bağlı>
ADMIN_EMAIL=...
ADMIN_PASSWORD=...   # yalnızca ilk çalıştırmada kullanıcı oluşturmak için; seed sonrası sil
```

5. Mobil uygulamada API adresi `app.config.ts → extra.apiUrl` ile ayarlanır. Geliştirmede yerel IP, üretimde `https://takip.<alan-adı>/api/v1`.
6. Aynı VPS'te başka servisler de çalışıyorsa API'ye bellek sınırı koy (örneğin 512 MB). MongoDB'nin `wiredTigerCacheSizeGB` değerini düşük tut (örneğin 0.5).

## 8. Fazlar ve kabul kriterleri

- **Faz 0 — İskelet:** pnpm monorepo, TypeScript ayarları, ESLint/Prettier, packages/shared. API'de /health çalışıyor, mobilde boş sekmeler ve tema geçişi var. Yerel geliştirme için docker-compose.dev.yml (yalnızca MongoDB). ✔ `pnpm dev:api` ve `pnpm dev:mobile` çalışıyor; telefonda 6 sekme ve koyu/açık tema görünüyor.
- **Faz 1 — Veri ve program:** Modeller, giriş (seed kullanıcı), bloklar, ensureWeek, instance done/undo/skip. Mobilde Bugün, Hafta, Blok ekle, Blok detayı ekranları. ✔ Blok eklenince doğru günlere düşüyor; işaretleme ve atlama çalışıyor; testler geçiyor.
- **Faz 2 — Hedefler ve ilerleme:** Hedefler, ProgressLog, blok → ilerleme bağlantısı, istatistik aggregation'ları. Mobilde Hedefler, İlerleme gir ve İlerleme ekranları. ✔ "92 → 117 / 150" hesabı doğru; ısı haritası ve seriler gerçek veriyle çalışıyor.
- **Faz 3 — Cezalar:** Kurallar, ceza motoru (Agenda), yükseltme, Cezalar ekranı ve Bugün'deki uyarı. ✔ Kaçırılan blok 30 dakika sonra ceza üretiyor; süresi geçen ceza iki katına çıkıyor; motor testleri geçiyor.
- **Faz 4 — Odak ve günlük:** Dağ tırmanışı bileşeni, odak seansı API'si, arka plan tespiti, Odak bitti ekranı. Günlük ve takvim. ✔ Uygulama arka plana atılıp geri gelince süre doğru; çıkış yapılırsa seans interrupted oluyor.
- **Faz 5 — Bildirimler:** Expo push kurulumu (Firebase), cihaz token kaydı, yerel hatırlatmalar, bildirim kanalları, sessiz saatler, motivasyon mesajları, haftalık rapor. ✔ Development build'de hatırlatma, ceza ve motivasyon bildirimleri geliyor; bildirime dokununca ilgili ekran açılıyor.
- **Faz 6 — MCP:** MCP sunucusu (Aşama 1 kimlik doğrulama), bütün araçlar, AuditLog, geri alma, PendingChange onay akışı. Claude bağlantısı ve Claude onayı ekranları. ✔ `npx @modelcontextprotocol/inspector` ile bütün araçlar test edildi. claude.ai'ye özel bağlayıcı olarak eklendi; "yarın 7'de 30 km bisiklet ekle" komutu programa düştü; silme işlemi telefondan onay istedi.
- **Faz 7 — Dağıtım ve sağlamlaştırma:** Coolify kurulumu, yedekleme, rate limit (@fastify/rate-limit), CORS, helmet, log ayarları, Ayarlar ekranı, JSON dışa aktarma, EAS ile release APK. ✔ Telefondaki release build üretim API'sine bağlanıyor; yedekten geri yükleme bir kez denendi.
- **Faz 8 (sonra):** OAuth 2.1 (MCP Aşama 2), Android ana ekran widget'ı, Strava entegrasyonu (bisiklet km'sinin otomatik girilmesi).

## 9. Dikkat edilecek tuzaklar

- **Saat dilimi:** "Bugün" ve "bu hafta" hesapları her zaman Europe/Istanbul'a göre yapılmalı. Bunun için date-fns-tz veya Temporal polyfill kullan. 00:00–03:00 arası UTC'de bir önceki güne düşer; bu aralık için test yaz.
- **Expo Go'da push bildirimi çalışmaz.** Faz 5'ten itibaren development build zorunlu.
- **Android'de tam zamanında bildirim:** Pil optimizasyonu planlı bildirimleri geciktirebilir. Gerekirse kullanıcıyı ayarlar ekranından pil optimizasyonu istisnasına yönlendir.
- **MongoDB'yi asla internete açma.** Coolify'da "Make it publicly available" kapalı kalmalı.
- MCP araçlarının yanıtları kısa ve yapılandırılmış olsun. Claude'a gereksiz büyük JSON dönme.
- Odak sayacını telefonda gerçekten "kilitlemek", yani diğer uygulamaları engellemek, bu projenin kapsamı dışında. Yalnızca arka plana geçiş tespit edilir.
- Agenda işleri birden fazla API kopyası çalışırsa çakışabilir. Tek kopya çalıştır veya Agenda'nın kilit mekanizmasını doğrula.
