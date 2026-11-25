# Bildirim kurulumu (Faz 5): Firebase, EAS ve development build

Push bildirimleri Expo Push Service → FCM üzerinden gider. **Expo Go'da push çalışmaz**; yerel
bildirimler (blok hatırlatması, odak ve mola bitişi) Expo Go'da da çalışır. Aşağıdaki adımlar bir
kez yapılır. Gizli dosyalar (`google-services.json`, servis hesabı anahtarı) git'e girmez.

## 1. EAS projesi

```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas init            # projeyi expo.dev'de oluşturur, proje kimliğini (UUID) yazdırır
```

`app.config.ts` dinamik olduğu için `eas init` kimliği dosyaya yazamaz; elle tanımla:

- Yerelde: `apps/mobile/.env` → `EAS_PROJECT_ID=<uuid>`
- EAS Build için (her ortam: development, preview, production):

```bash
eas env:create --environment development --name EAS_PROJECT_ID --value <uuid> --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_API_URL --value http://<bilgisayar-ip>:3000/api/v1 --visibility plaintext
```

## 2. Firebase projesi ve `google-services.json`

1. https://console.firebase.google.com → Proje ekle (Analytics gerekmez).
2. Android uygulaması ekle; paket adı **`com.takip.app`** (app.config.ts ile aynı olmalı).
3. `google-services.json` dosyasını indir → `apps/mobile/google-services.json` (gitignore'da).
4. EAS Build'e dosya değişkeni olarak yükle:

```bash
eas env:create --environment development --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
```

Yerel `npx expo run:android` için `apps/mobile/.env` → `GOOGLE_SERVICES_JSON=./google-services.json`.

## 3. FCM V1 kimlik bilgisi (Expo'nun FCM'e mesaj atabilmesi için)

1. Firebase → Proje ayarları → **Hizmet hesapları** → "Yeni özel anahtar oluştur" (JSON iner).
2. `cd apps/mobile && eas credentials` → Android → (profil) → **Google Service Account** →
   "Manage your Google Service Account Key for Push Notifications (FCM V1)" → JSON'u yükle.
3. İnen JSON'u sonra sil ya da güvenli bir yerde sakla; depoya koyma.

## 4. Development build

```bash
cd apps/mobile
eas build --profile development --platform android
```

Çıkan APK'yı telefona kur. Ardından kökte `pnpm dev:api` ve `pnpm dev:mobile`; telefondaki
"Takip" (development build) uygulaması Metro'ya bağlanır.

## 5. (İsteğe bağlı) Push güvenliği

expo.dev → proje → Settings → **Enhanced security for push notifications** açılırsa Expo yalnızca
erişim anahtarıyla gelen push isteklerini kabul eder. expo.dev → Account settings → Access tokens
ile bir anahtar oluştur ve API ortamına `EXPO_ACCESS_TOKEN=` olarak yaz (Coolify'da da).

## 6. Doğrulama

- Uygulamayı aç, giriş yap, bildirim iznini ver. API logunda hata olmamalı; `devicetokens`
  koleksiyonunda cihazın token'ı görünür.
- Ayarlar → **Test bildirimi**: birkaç saniye içinde motivasyon kanalından bildirim gelir;
  dokununca İlerleme gir ekranı açılır. Sessiz saatteysen sıraya alınır, saat bitince gelir.
- Pil optimizasyonu hatırlatmaları geciktirebilir: Ayarlar → Uygulama ayarları → Pil → "Kısıtlama yok".

## Sorun giderme

| Belirti                                                                     | Neden                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Ayarlar'da "EAS proje kimliği tanımlı değil"                                | `EAS_PROJECT_ID` yok ya da build onu görmedi (EAS env değişkeni). |
| Push kaydı başarısız: "Default FirebaseApp is not initialized"              | `google-services.json` build'e girmedi (`GOOGLE_SERVICES_JSON`).  |
| Kayıt var, push gelmiyor; `notifications.push.error` = `InvalidCredentials` | FCM V1 anahtarı EAS'a yüklenmedi (adım 3).                        |
| `push.status` = `skipped`, `error` = `NO_DEVICE`                            | Cihaz token'ı kayıtlı değil; uygulamayı açıp izin ver.            |
| `push.status` = `queued`                                                    | Sessiz saat; `push.sendAfter` anında gönderilir.                  |
