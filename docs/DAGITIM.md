# Dağıtım (Faz 7): Coolify, MongoDB, yedek, release APK

Hedef: aynı VPS'te Coolify; API `https://takip.<alan-adı>`, MongoDB yalnızca iç ağda.

## 1. Coolify projesi

Coolify → **Projects → New** (`takip`) → Environment `production`.

## 2. MongoDB

1. Projede **+ New → Database → MongoDB** (sürüm 8).
2. **Make it publicly available: KAPALI.** Public port açılmaz; API iç Docker ağından bağlanır.
3. Özel ayar (Custom MongoDB configuration / start command) ile önbelleği küçült:
   `--wiredTigerCacheSizeGB 0.5`
4. Root kullanıcıdan ayrı uygulama kullanıcısı: Coolify'da veritabanının **Terminal** sekmesi →

```js
mongosh -u <root-kullanıcı> -p <root-şifre> --authenticationDatabase admin
use takip
db.createUser({ user: 'takip_app', pwd: '<uzun-rastgele-şifre>', roles: [{ role: 'readWrite', db: 'takip' }] })
```

5. İç servis adını not al (veritabanı sayfasında "Internal URL"; örn. `mongodb-xyz`).

## 3. Yedekleme ve geri yükleme denemesi

1. Veritabanı → **Backups**: zamanlama `0 3 * * *` (her gün 03:00), "Save to S3" açık.
   S3 uyumlu depo (Cloudflare R2, Backblaze B2, Hetzner Object Storage…) Coolify → **S3 Storages**'tan eklenir.
   Saklama: en az 14 yedek.
2. **Backup Now** ile bir yedek al; S3'te dosyanın oluştuğunu gör.
3. **Geri yüklemeyi bir kez dene** (asıl veritabanına dokunmadan):

```bash
# Yedeği indir (S3 panelinden ya da Coolify'dan), sonra yerelde:
docker run -d --rm --name takip-restore -p 127.0.0.1:27019:27017 mongo:8
docker cp <yedek>.gz takip-restore:/tmp/yedek.gz
docker exec takip-restore mongorestore --gzip --archive=/tmp/yedek.gz
docker exec takip-restore mongosh takip --quiet --eval 'db.getCollectionNames().map(c => [c, db[c].countDocuments()])'
docker stop takip-restore
```

Sayılar üretimle uyuşuyorsa geri yükleme doğrulanmıştır. Gerçek felakette aynı `mongorestore`
komutu Coolify veritabanı terminalinde `--drop` ile çalıştırılır (önce API'yi durdur). 4. Ek olarak uygulamadaki Ayarlar → **Yedeği indir (JSON)** kişisel kopya verir (geri yükleme aracı değildir).

## 4. API uygulaması

1. **+ New → Application → (GitHub App ya da Public/Private repo)**, dal `main`.
2. **Build Pack: Dockerfile**, Dockerfile yolu `apps/api/Dockerfile`, **Base Directory `/`** (build bağlamı repo kökü).
3. Domain: `https://takip.<alan-adı>`; port **3000**. Traefik + Let's Encrypt sertifikayı kendisi alır.
4. Health check: yol `/health`, port 3000 (imajda ayrıca Docker HEALTHCHECK var).
5. **Automatic deployment** açık (push sonrası).
6. Kaynak sınırı: Advanced → Memory limit **512m** (VPS'te başka servisler varsa).
7. Ortam değişkenleri (Coolify → Environment Variables; "Build variable" işaretleme):

```
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://takip_app:<şifre>@<iç-servis-adı>:27017/takip?authSource=takip
JWT_ACCESS_SECRET=<openssl rand -base64 64>
JWT_REFRESH_SECRET=<openssl rand -base64 64>
MCP_SECRET=<openssl rand -base64 48 | tr '+/' '-_' | tr -d '='>   # Faz 6 atlandı; yine de zorunlu
APP_TIMEZONE=Europe/Istanbul
LOG_LEVEL=info
TRUST_PROXY=true
RATE_LIMIT_MAX=300
EXPO_ACCESS_TOKEN=<isteğe bağlı, docs/BILDIRIM_KURULUMU.md §5>
ADMIN_EMAIL=<e-posta>
ADMIN_PASSWORD=<ilk girişten sonra SİL ve yeniden deploy et>
```

8. Deploy → logda `İlk kullanıcı oluşturuldu` görünür → `ADMIN_PASSWORD`'ü sil → yeniden deploy.
9. Kontrol: `curl https://takip.<alan-adı>/health` → `{"ok":true,"db":"up",...}`

Tek API kopyası çalıştır (Agenda işleri; rate limit sayacı bellekte).

## 5. Release APK (EAS)

```bash
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://takip.<alan-adı>/api/v1 --visibility plaintext
eas env:create --environment production --name EAS_PROJECT_ID --value <uuid> --visibility plaintext
eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
eas credentials   # Android → production: imza anahtarını EAS üretsin; FCM V1 anahtarını yükle
eas build --profile production --platform android
```

APK'yı telefona kur (önceki development build'den ayrı bir imzayla geldiği için önce onu kaldırman gerekebilir).
Release build yalnızca HTTPS'e bağlanır (Android cleartext'i engeller); adres mutlaka `https://`.

## 6. Kabul kontrolü

- [ ] Telefondaki release build üretim API'sine bağlanıyor, giriş ve veri geliyor.
- [ ] Test bildirimi geliyor (Ayarlar).
- [ ] MongoDB dışarıdan erişilemiyor: `nc -vz <vps-ip> 27017` başarısız olmalı.
- [ ] Yedek S3'te; yedekten geri yükleme bir kez denendi (§3.3).
- [ ] Üst üste 11 yanlış girişte 429 dönüyor.
