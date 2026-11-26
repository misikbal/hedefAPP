# Strava kurulumu

Strava'daki bisiklet sürüşlerinin km'si seçilen `km` birimli hedefe kendiliğinden ilerleme olarak
yazılır (`ProgressLog.source = 'strava'`, `externalId` = Strava etkinlik id'si; aynı etkinlik iki kez
yazılmaz). Ortam değişkenleri tanımlı değilse entegrasyon uygulamada "Kapalı" görünür, geri kalan her
şey çalışmaya devam eder.

## 1. Strava'da API uygulaması aç

1. https://www.strava.com/settings/api adresine git.
2. Bilgileri doldur:
   - **Application Name:** Takip (istediğin ad)
   - **Website:** https://hedef.kodmis.com
   - **Authorization Callback Domain:** `hedef.kodmis.com` (yalnız alan adı; `https://` ve yol yok)
3. Kaydettikten sonra **Client ID** ve **Client Secret** değerlerini al.

Not: Yeni Strava uygulamaları başta yalnızca uygulama sahibinin hesabına bağlanabilir ("Athlete
Capacity" 1). Tek kullanıcılı uygulama için bu yeterli.

## 2. Ortam değişkenleri (Coolify)

```env
STRAVA_CLIENT_ID=123456
STRAVA_CLIENT_SECRET=0123456789abcdef0123456789abcdef01234567
# openssl rand -hex 24
STRAVA_WEBHOOK_VERIFY_TOKEN=3f9c0d6e1a2b4c5d6e7f8091a2b3c4d5e6f70812
PUBLIC_API_URL=https://hedef.kodmis.com
```

- `PUBLIC_API_URL` kök adrestir (sonunda `/api/v1` yok). Buradan kurulan adresler:
  - OAuth dönüşü: `https://hedef.kodmis.com/api/v1/integrations/strava/callback`
  - Webhook: `https://hedef.kodmis.com/api/v1/integrations/strava/webhook`
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `PUBLIC_API_URL` üçü tanımlıysa entegrasyon açılır.
  `STRAVA_WEBHOOK_VERIFY_TOKEN` yalnızca webhook için gerekli (yoksa elle eşitleme çalışır).
- Değişkenleri ekledikten sonra API'yi yeniden dağıt.

## 3. Webhook aboneliği (uygulama başına bir kez)

API üretimde çalışırken (Strava oluşturma sırasında webhook adresine doğrulama isteği atar):

```bash
# Kök .env'de ya da komut satırında yukarıdaki dört değişken tanımlı olmalı
pnpm --filter @takip/api strava:subscribe            # mevcut aboneliği gösterir, yoksa oluşturur
pnpm --filter @takip/api strava:subscribe -- --delete  # aboneliği siler (adres değişirse)
```

Strava'da uygulama başına tek abonelik olabilir. Adres değişirse önce `--delete`, sonra tekrar çalıştır.

## 4. Uygulamada bağlan

1. Ayarlar → Strava → "Strava'ya bağlan". Tarayıcıda Strava izin ekranı açılır; "Authorize" de.
2. Uygulamaya dönünce sporcu adın görünür. Bir **km** birimli hedef seç (yoksa önce oluştur).
3. Etkinlik türleri varsayılan olarak bisiklet türleridir (Ride, VirtualRide, EBikeRide, GravelRide,
   MountainBikeRide); istersen değiştir.
4. "Şimdi eşitle" son 30 günü (sonraki eşitlemelerde son eşitlemenin 2 gün öncesinden bu yana) çeker.

## 5. Test

- Webhook doğrulaması:
  ```bash
  curl "https://hedef.kodmis.com/api/v1/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN&hub.challenge=deneme"
  # {"hub.challenge":"deneme"}
  ```
- Strava'da kısa bir etkinlik kaydet ya da elle ekle → birkaç saniye içinde hedefte görünmeli.
  Etkinliğin türünü değiştirirsen (ör. yürüyüş) kayıt silinir; etkinliği silersen kayıt da silinir.
- Strava → Ayarlar → Uygulamalarım → Takip → "Erişimi kaldır" → bağlantı API'de silinir.

## Davranış notları

- Miktar: `distance / 1000`, 0.1 km'ye yuvarlanır. Gün: `start_date_local`'ın günü. Not: etkinlik adı.
- Hedef seçimi değişirse önceden yazılan kayıtlar eski hedefte kalır; yeni etkinlikler yeni hedefe yazılır.
- Bağlantıyı kesmek Strava'daki izni de kaldırır; yazılmış ilerlemeler silinmez.
- Strava webhook'ları imzalı değil: sunucu olayın içeriğine güvenmez, etkinliği her zaman Strava'dan
  yeniden çeker (silme 404 ile, erişim kaldırma token'ın gerçekten geçersiz olmasıyla doğrulanır).
- Yerelde webhook gelmez (adres dışarıdan erişilemez); "Şimdi eşitle" kullan. Yerel denemede
  `PUBLIC_API_URL` için Strava'daki callback domain'i `localhost` yapılabilir.
