# Devir notu — Faz 4'e başlarken (2026-11-25)

Bu dosya Faz 4'ü (Odak ve günlük) yeni bir sohbette yürütebilmen için yazıldı. Sırayla oku:
1. `PROJE_CONTEXT.md`: ürünün tamamı; özellikle §1 "Odak figürü: dağ tırmanışı", §3 `FocusSession` ve `JournalEntry`, §4 REST, §8 Faz 4.
2. `CLAUDE.md`: kısa kurallar, notlar ve Faz 3 kararları.
3. `HANDOFF_FAZ3.md` §2–§4: çalıştırma, kod haritası, tuzaklar (hepsi hâlâ geçerli; tekrar yazılmadı).
4. Bu dosya: Faz 3'ten sonra eklenenler ve Faz 4'te tam olarak ne yapılacak.

Çalışma biçimi: kullanıcıyla Türkçe konuş. Faz sonunda çalıştırma komutlarını, test sonuçlarını ve "elle kontrol et" listesini ver, sonra dur.

**Ön koşul:** Faz 3 kodlandı ama kullanıcı onayı bekliyor (CLAUDE.md "Faz durumu"). Başlamadan önce kullanıcıya Faz 3'ü onaylayıp onaylamadığını sor; onaylamadıysa önce onun geri bildirimlerini bitir.

---

## 1. Durum

| Faz | Durum |
|---|---|
| 0–2 | tamam |
| 3 — Cezalar | kodlandı, onay bekliyor |
| **4 — Odak ve günlük** | **sırada** |

Son doğrulama (bu notu yazarken): `pnpm test` → shared 43, api 65 test geçti.

## 2. Faz 3'te eklenenler (kod haritasına ek)

- API: `db/models/PenaltyRule.ts`, `Penalty.ts`; `services/penaltyRules.ts`, `penalties.ts`, `penaltyEngine.ts`; `jobs/index.ts` (Agenda, 15 dk); `modules/penalties`; `services/notify.ts` (bilerek boş, `NotifyEvent` birleşimi; Faz 4'te yeni olay **ekleme**, bildirim Faz 5'in işi).
- Testler: `penaltyEngine.test.ts`, `penaltiesApi.test.ts`.
- Shared: `schemas/penalty.ts`, `rulesForBlock` / `rulesForGoal`.
- Mobil: `app/(tabs)/penalties.tsx`, `app/penalties/rules/new.tsx`, `src/features/penalties/*`. Sorgu anahtarları `src/api/hooks.ts → keys`.
- Demo verisi: 5 ceza kuralı; "Odak" hedefi (`unit: 'saat'`, haftalık 15, `category: 'project'`) şu an `ProgressLog` (source `app`) ile dolduruluyor.

## 3. Faz 4'ün kapsamı

Kabul ölçütü (PROJE_CONTEXT §8): **Uygulama arka plana atılıp geri gelince süre doğru; çıkış yapılırsa seans interrupted oluyor.** Ayrıca Odak, Odak bitti, Günlük ve Günlük takvimi ekranları tasarımla birebir çalışmalı.

Tasarım dosyaları (`python3 -I scripts/extract-design.py` → `design-extracted/`): `03-Odak-sayacı.html`, `14-Odak-seansı-bitti.html`, `04-Günlük.html`, `15-Günlük-takvimi.html`. Ölçüler ve renkler bu dosyalardan alınır; aşağıdaki özet onların yerine geçmez.

### 3.1 Veri

```ts
FocusSession { userId, label, plannedMinutes: 25|50|90, startedAt, endedAt?, pausedMs, pausedAt? /*ek alan*/,
               status: 'running'|'paused'? /*karar 5.3*/|'completed'|'interrupted'|'abandoned',
               interruptions: 0|1|2|3, backgroundMs? /*tespit edilen arka plan süresi*/, note?, goalId?,
               progressLogId? /*hedefe yazılan kayıt*/ }
// index: { userId, startedAt }; aynı anda en fazla bir açık seans:
// partial unique { userId } where status ∈ {running, paused}

JournalEntry { userId, date /*yerel gün*/, mood: 0..4, wentWell?, hard?, tomorrowOne? }
// unique { userId, date }; metin alanları zod'da trim + max uzunluk (öneri 1000)
```

- Süre her zaman **duvar saatinden** hesaplanır: `elapsedMs = (endedAt ?? now) − startedAt − pausedMs − (pausedAt ? now − pausedAt : 0)`, `plannedMinutes*60_000` ile sınırlanır. Bu fonksiyon `@takip/shared` içine yazılır (API ve mobil aynısını kullanır) ve gece yarısı / duraklatma testleri yazılır.
- Sunucu tarafında `clock.now()` kullan; mobilde `Date.now()`.

### 3.2 Servisler ve REST (PROJE_CONTEXT §4)

```
POST /focus/start            { label, plannedMinutes, goalId? } → FocusSessionDto (açık seans varsa 409)
POST /focus/:id/pause        POST /focus/:id/resume
POST /focus/:id/finish       { note?, interruptions } → seans + haftalık odak özeti (önce → sonra)
POST /focus/:id/interrupt    { backgroundMs } → status interrupted
GET  /focus/active           → açık seans | null   (ek uç; uygulama açılışında sayacı geri yüklemek için)
GET  /focus/week             → bu haftanın seansları (zirveler şeridi), toplam / hedef saat, bugünkü zirve sayısı ve süre
GET  /focus/labels           → son kullanılan etiketler (ek uç; karar 5.2'ye bağlı)

GET  /journal?month=YYYY-MM  → ayın kayıtları (takvim) 
GET  /journal/:date          → kayıt | null + günün istatistik çipleri
PUT  /journal/:date          { mood, wentWell?, hard?, tomorrowOne? } (gelecek gün reddedilir)
GET  /journal/recent?limit=  → önceki günler listesi (ek uç; ya da /journal?before=&limit=)
```

- `services/focus.ts`: start / pause / resume / finish / interrupt / active / week. Durum geçişlerini tek yerde doğrula (ör. `completed` seans duraklatılamaz → 409, Türkçe mesaj).
- **Hedefe yazma:** `finish` (ve karar 5.3'e göre `interrupted`) seansın gerçekleşen dakikalarını `goalId`'ye `ProgressLog { source: 'focus' }` olarak yazar. Birim dönüşümü: hedef `saat` ise dakika/60 (1 ondalık), `dakika` ise dakika; başka birim reddedilir. `goalId` verilmezse: kullanıcının birimi `saat`/`dakika` olan ilk aktif hedefi (demo: "Odak"). `progressLogId` seansta saklanır; idempotent olmalı (iki kez finish → tek kayıt).
- **Odak bitti ekranındaki "4,5 → 5,3 / 15 sa"** önceki ve sonraki haftalık toplamdır; `finish` yanıtında dönmek en kolayı.
- `stats.timeSplit` (`services/stats.ts` ~423. satır, yorumda "Faz 4'te odak süresi eklenecek" yazıyor): tamamlanan odak süresini ekle. Kategori = bağlı hedefin kategorisi, yoksa `project`. Aynı süreyi bir bloktan ve bir seanstan iki kez saymamaya dikkat (bkz. 5.6).
- `/today`: Odak sekmesinin üst etiketi "BUGÜN 2 ZİRVE · 1 SA 40 DK" `/focus/week`'ten gelir; `/today`'i değiştirmen gerekmez.
- **Günün istatistik çipleri** (Günlük ve takvim): "25 km bisiklet · 1 sa 40 dk odak · 4/6 görev · 1 ceza bekliyor". Öneri: o günün `ProgressLog` toplamları (odak hedefi hariç, en çok 1–2 hedef), o günün tamamlanan odak süresi, `done / (planned+done+missed)` blok sayısı, o gün bekleyen/oluşan ceza sayısı. `views.ts` içinde `dayStats(user, date)` olarak yaz; takvimdeki "4/5 blok · 1 sa 40 dk odak · ceza yok" satırı da aynısını kullanır.
- Arka planda unutulan seanslar: `startedAt + plannedMinutes + 6 saat` geçmiş açık seansları `abandoned` yapan küçük bir Agenda işi ekle (`jobs/index.ts`, ceza motoruyla aynı desen; testte doğrudan fonksiyonu çağır).

### 3.3 Mobil

**Odak sekmesi** (`app/(tabs)/focus.tsx`, tasarım 03):
- Üst etiket "BUGÜN N ZİRVE · X SA Y DK"; "Ne üzerinde çalışıyorsun?" seçimi (çip satırı; tasarımdaki seçenekler: KODMIS — tema editörü, AKSA ERP — arayüz, Ders hazırlığı, Almanca çalışma → karar 5.2).
- Dağ sahnesi `react-native-svg` (kurulu), `viewBox 0 0 320 220`. Çokgenler, kar, kesikli patika + amber ilerleme çizgisi (`strokeDasharray=L`, `strokeDashoffset=L*(1-p)`), işaretçi (r 9 opak 0.25 + r 5), bitince bayrak. Patika noktaları:
  `[[80,206],[230,184],[120,160],[235,136],[150,112],[226,90],[175,70],[208,50],[200,26]]`. Nokta hesabı tasarımdaki JS ile aynı (segment uzunlukları üzerinden). Bu hesabı saf fonksiyon yap (`src/features/focus/mountain.ts`) ve shared'a ya da mobil teste koy.
- Sol üstte "DAĞ · 50 DK" ve "950 / 2.500 m" (`formatNumber`); yükseklik `round(altitude * p)`. Seviye bilgisi `FOCUS_LEVELS` (shared/constants.ts) içinde zaten var.
- Sayaç 56 px JetBrains Mono, kalan süre `MM:SS`. Durum metni: `tırmanıyorsun` / `mola · tırmanış duraklatıldı` / `zirvedesin — bayrak dikildi` / `yola çıkmaya hazır`; interrupted ise ayrıca belirtilir (metin tasarımda yok → öner: "bölündü · arka planda 12 sn").
- 25/50/90 seçimi (56 px, seçili ters renk; alt satır "Dağ · 2500 m"); seans açıkken değiştirilemez. Ana düğme Başlat / Duraklat / Devam et, yanında sıfırla (56 px yuvarlak; açık seansta `abandon` → onay iste). "Seansı bitir ve kaydet" bağlantısı → `focus/done`.
- "Bu haftanın zirveleri · 5,3 / 15 sa": seanslar yüksekliği `altitude/4100*60` px üçgenler (tamamlanan `ok`, sürmekte olan `acc` ve ilerlemeyle büyür, yarım kalan soluk → `line2` opaklık 0.6), sağda boş yer tutucular. Alt açıklama metni tasarımda.
- **Sayaç durumu:** zustand (`src/store/focusStore.ts`, AsyncStorage ile kalıcı) + sunucu. Ekran her saniye yeniden çizer ama değeri `elapsedMs()` ile duvar saatinden hesaplar; `setInterval`'deki sayıyı toplama. Uygulama açılışında `GET /focus/active` ile durumu geri yükle.
- **Arka plan tespiti:** `AppState` → `background` anını kaydet (store'a, kalıcı). `active`'e dönünce fark > 10 sn ise `POST /focus/:id/interrupt { backgroundMs }`. Uygulama arka plandayken öldürülürse: açılışta açık seans + kayıtlı `backgroundAt` varsa aynı kontrolü yap. "Çıkış yapılırsa" (logout) açık seans önce `interrupt` edilir.
- **Yerel bildirim** (seans bitiş saati): `expo-notifications` henüz kurulu **değil** → karar 5.4.
- Haptik: bitişte `expo-haptics` (kurulu) kısa titreşim.

**Odak bitti** (`app/focus/done.tsx`, tasarım 14; `_layout.tsx`'e ekle): "50 dakika tamam", etiket, "Haftalık odak 4,5 → 5,3 / 15 sa", "Ne yaptın?" (çok satırlı), "Kaç kez bölündün?" Segmented `Hiç / 1–2 / 3+` (→ `interruptions` 0/1/3; otomatik tespit edilen arka plan sayısıyla ön doldur), "Kaydet ve 10 dk mola" (birincil) ve "Kaydet ve kapat". Mola davranışı → karar 5.5. Erken bitirilen seansta başlık "32 dakika" gibi gerçek süre olur.

**Günlük sekmesi** (`app/(tabs)/journal.tsx`, tasarım 04): üst etiket "24 KASIM · 23:00" (yerel tarih ve saat), "Takvim" düğmesi, gün çipleri, "Gün nasıl geçti?" 5 ruh hâli (64 px kutular; nokta renkleri `[line2, mut, tx2, oku, acc]`, etiketler `Zor, Durgun, Normal, İyi, Harika` → shared'a `MOOD_LABELS` olarak ekle), üç soru (Ne iyi gitti? / Ne zorladı? / Yarın için tek bir şey), Kaydet, "Önceki günler" (10 px nokta + "PAZARTESİ · 23 KASIM" + metnin ilk satırı; metin = `wentWell` yoksa `hard`/`tomorrowOne`). Formu react-hook-form + zod ile yaz; mevcut kayıt varsa ön doldur.

**Günlük takvimi** (`app/journal/calendar.tsx`, tasarım 15): ay başlığı ("Kasım 2026") ve ileri/geri, Pt–Pz başlıkları (hafta pazartesi), 44 px hücreler; kayıtlı gün ruh hâli renginde, `mood >= 3` ise yazı `onAcc`; seçili gün 2 px `tx` kenarlık; kaydı olmayan gün 1 px `line` kenarlık ve tıklanamaz. Alt kısımda seçili günün tarihi, ruh hâli, notu ve istatistik satırı. Renk açıklaması (10 px kareler). Ayın ilk gününden önceki boş hücre sayısı `isoDayOfWeek(monthStart) − 1`.

## 4. Testler (zorunlu)

- `elapsedMs`: duraklatma, devam, sınırlama, bitmiş seans; gece yarısını aşan seans (yerel 23:50 → 00:40, seansın günü `startedAt`'in yerel günü).
- focus servisi: tek açık seans kuralı (409), geçersiz durum geçişleri, finish → doğru birimde tek `ProgressLog` (idempotent), interrupt, terk edilen seans işi.
- `/focus/week`: hafta sınırı pazartesi 00:00 Europe/Istanbul (UTC pazar 21:00).
- journal: PUT upsert (aynı gün iki kez → tek kayıt), gelecek gün 400, `?month=` sınırları, `dayStats`.
- `stats.timeSplit`'te odak süresi.
- Mobil saf fonksiyonlar (patika noktası, takvim ızgarası) için de birim testi; mobilde test altyapısı yoksa bunları `@takip/shared`'a koy ve orada test et.

## 5. Kullanıcıya sorulacak kararlar (başlamadan önce)

1. **Expo Go mu development build mi:** Faz 4 yalnızca Expo Go ile test edilecekse yerel bildirim Expo Go'da çalışır mı, güncel SDK 58 belgesinden doğrula (push çalışmaz; yerel bildirimin durumu sürüme göre değişti).
2. **"Ne üzerinde çalışıyorsun?" listesi:** serbest metin + son kullanılan etiketler mi, aktif `project` kategorisindeki bloklar/hedefler mi, yoksa ayrı bir "odak projeleri" listesi mi?
3. **Arka plan → interrupted ne demek:** seans orada biter mi (`status: interrupted`, süre o ana kadar sayılır ve hedefe yazılır mı?) yoksa seans sürer, yalnızca `interruptions` artar ve ekranda "bölündü" mü yazar? Ayrıca duraklatma ayrı bir `paused` durumu mu, yoksa `running` + `pausedAt` mı?
4. **Yerel bildirim bağımlılığı:** seans bitişi için `expo-notifications` şimdi mi kurulsun (PROJE_CONTEXT yığınında var; Faz 5'te zaten gerekecek), yoksa Faz 5'e mi bırakılsın? CLAUDE.md kuralı gereği gerekçeyle onay iste.
5. **"Kaydet ve 10 dk mola":** yalnızca ekranda geri sayım mı, mola bitişinde bildirim mi, yoksa şimdilik "Kaydet ve kapat" ile aynı mı?
6. **Çift sayım:** "Odak" hedefine hem odak seansı hem bloktan (`goalId` bağlı blok) ilerleme yazılabilir. Seans, aynı saatte süren bir bloğa denk gelirse ne olacak? Öneri: ikisi bağımsız sayılır, kullanıcı blokları odak hedefine bağlamaz.
7. **Günlük tarihi:** gece yarısından sonra (ör. 00:30) yazılan günlük önceki güne mi sayılsın? Öneri: 04:00'e kadar önceki gün, ama karar kullanıcının.
8. **Demo verisi:** seed'e son 4 haftanın odak seansları (Odak hedefindeki `app` kayıtlarının yerine `focus` kaynaklı) ve son 30 günün günlük kayıtları eklensin mi?

Kararları aldıktan sonra CLAUDE.md'ye "Faz 4 kararları" bölümü olarak yaz (Faz 3 kararları gibi).

## 6. Faz sonunda

- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `cd apps/mobile && npx expo export --platform android`, `npx expo-doctor`.
- CLAUDE.md "Faz durumu" satırını güncelle; PROJE_CONTEXT §3'e eklenen alanları (`pausedAt`, `backgroundMs`, `progressLogId`, ek uçlar) işle.
- "Elle kontrol et" listesine mutlaka şunları koy: 50 dk seans başlat → uygulamayı 5 sn arka plana at → süre doğru, bölünme yok; 15 sn arka plana at → interrupted; uygulamayı kapatıp aç → sayaç kaldığı yerden; duraklat/devam; seansı bitir → Odak hedefi ve haftalık zirveler güncellendi; günlük kaydet → takvimde doğru renk; açık/koyu temada dört ekran.
- Sonra dur ve Faz 5 için onay iste.
