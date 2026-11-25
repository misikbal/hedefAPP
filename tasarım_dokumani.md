Kişisel Takip Uygulaması — Tasarım Dokümanı
25 Kas 2026 · @Muhammed ikbal Sirdas
Genel bakış
Tasarım, tek kullanıcılı bir Android takip uygulamasının 21 ekranını koyu ve açık temada gösteriyor; toplam 42 artboard, telefon boyutunda (390 × 844).
Uygulama dört şeyi bir arada tutar: haftalık program (gün, saat, ne yapılacağı), sayısal hedefler (örneğin haftada 150 km bisiklet, günde 20 sayfa kitap, haftada 75 Almanca kelime, haftada 15 saat odak), kaçırılan işler için kullanıcının kendi koyduğu cezalar ve günlük. Yanında dağ tırmanışı figürlü bir odak sayacı, bildirimler ve motivasyon mesajları vardır.
Claude uygulamanın içinde bir sohbet ekranı değildir: backend'in açtığı MCP sunucusu claude.ai'ye özel bağlayıcı olarak eklenir, kullanıcı programını Claude'a sohbetle düzenletir. Uygulama bu değişiklikleri listeler, geri almaya izin verir ve bazılarını onaya bağlar.
Kanvas sayfası
İçerik
Koyu tema
1. sıra: 8 ana ekran · 2. sıra: 13 ek ekran ve durum
Açık tema
Aynı 21 ekranın açık tema kopyası, aynı yerleşimde
Ekranlardaki rakamlar ve görev adları (KODMIS, AKSA ERP, 92 / 150 km gibi) örnek veridir.
Tasarım dili
Görünüm sade ve tekniktir: koyu grafit zemin, tek vurgu rengi olarak amber, sayılar için tek genişlikli yazı tipi. Emoji, gradyan ve gölge yoktur.
Renkler
Rol
Anahtar
Koyu
Açık
Zemin
bg
#0E1116
#F4F2ED
Kart
s1
#161B22
#FFFFFF
İkincil yüzey
s2
#1E242D
#ECE9E2
Çizgi
line / line2
#2A313B / #3A424E
#DEDAD1 / #BDB7AB
Alt menü
nav
#0B0E12
#FBFAF7
Metin
tx / tx2
#ECE8E1 / #C9CDD3
#16181C / #3A3F47
Soluk metin
mut
#9AA3AE
#5C636D
Vurgu (dolgu)
acc
#F0A63A
#F0A63A
Vurgu (metin)
accTx
#F0A63A
#9A5A06
Vurgu üstü metin
onAcc
#0E1116
#16181C
Tamam / Spor
ok / okTx
#5BB5A2
#3E9A86 / #24705F
Ceza
pen / penTx / penBg
#E0735A / #EE8A73 / #2A1A17
#D0573C / #A8402A / #FBEAE5
Dil
dil
#8FA7FF
#6F8CF0
Okuma
oku
#E7D7B8
#C9AE7E
Kategori renkleri sabittir: Proje amber, Spor yeşil, Dil mavi, Okuma bej. Açık temada vurgu metni koyulaştırılmıştır, çünkü açık zeminde amber metin okunmaz.
Tipografi
• Space Grotesk (500–700): ekran başlıkları 30 px, bölüm başlıkları 17–18 px, alt ekran başlıkları 22 px
• Inter (400–600): gövde metni 14–16 px, açıklamalar 12–13 px
• JetBrains Mono (400–500): sayılar, saatler, tarih şeritleri ve büyük harfli etiketler (11–12 px, geniş harf aralığı); sayaç 56 px
Bileşen kuralları
• Kart: 14–16 px köşe, 1 px çizgi, kart zemini
• Ana buton: hap şeklinde (22–28 px köşe), amber dolgu, 52–56 px yükseklik
• Girdi alanı: 48 px yükseklik, 12 px köşe
• Anahtar (switch): 52 × 32 px; açıkken amber, ceza kurallarında ceza rengi
• Segmentli seçici: seçili sekme ters renkli (koyu temada açık zemin)
• Dokunma alanı en az 44 px; ikonlar ince çizgili (1,8–2 px)
• Ceza ile ilgili her öğe (uyarı, etiket, kart) ceza renk üçlüsünü kullanır
Navigasyon
Alt menüde altı sekme vardır: Bugün, Hafta, Odak, Hedef, Ceza, Günlük. Ek ekranların her biri bir sekmeye bağlıdır; Claude ekranları ise sekme değil, Bugün'den ve Ayarlar'dan açılır.
Ekranlar arasında başka kısayollar da var: Blok detayındaki "Düzenle" Blok ekle'yi, bildirimler ilgili ekranı açar. İlk açılış ekranının dört adımı da sırasıyla Hedef ekle, Blok ekle, Claude (MCP) ve Kural ekle ekranlarını açar.
Ana ekranlar
Alt menüdeki altı sekme uygulamanın günlük kullanımını taşır; her biri kaydırılabilir bir içerik alanı ve sabit alt menüden oluşur.
Bugün
• Üst satır: tarih ve seri ("SALI · 24 KASIM · 12 GÜN SERİ"), selamlama, bildirim (okunmamış noktasıyla) ve ayarlar düğmeleri
• Bekleyen ceza uyarısı: "3 dk soğuk duş · Dün Almanca bloğu kaçtı · 14 sa kaldı", Cezalar'ı açar
• Günün notu: duruma göre motivasyon cümlesi
• Üç hedef kartı: Bisiklet 92/150 km, Kitap 12/20 sayfa, Almanca 48/75 kelime; ilerleme çubuğuyla
• Bugünün akışı: saat sıralı 6 blok, her birinde işaretleme düğmesi; işaretlenen blok soluk ve üstü çizili görünür, başlıkta "2/6" sayacı güncellenir; "+ İlerleme gir" düğmesi
• Claude'un son değişikliği: "Cumartesi bisikleti 40 → 60 km yaptı · Geri al"
Hafta
• Başlık "23 – 29 KASIM" ve amber "+ Blok" düğmesi
• 7 günlük şerit: gün adı, tarih ve o günün bloklarını kategori renginde gösteren küçük çizgiler; seçili gün ters renkli
• Renk açıklaması (Proje, Spor, Dil, Okuma)
• Seçili günün blokları: renk şeridi, ad, açıklama, başlangıç–bitiş saati ve varsa "kaçarsa: soğuk duş" etiketi; bloğa dokununca Blok detayı açılır
Odak
• Ne üzerinde çalışıldığı (proje seçimi)
• Dağ tırmanışı sahnesi, üzerinde yükseklik göstergesi ("950 / 2.500 m")
• Büyük sayaç ve durum metni ("tırmanıyorsun", "mola", "zirvedesin")
• 25 / 50 / 90 dk seçimi; her biri bir dağ boyuna karşılık gelir
• Başlat / Duraklat ve sıfırla düğmeleri, "Seansı bitir ve kaydet" bağlantısı
• Bu haftanın zirveleri: seanslar yan yana dağlar olarak, 5,3 / 15 sa
Hedefler
• Üstte İlerleme ve yeni hedef düğmeleri, haftalık rapor kartı ("%82 tamamlandı · 3/4 hedef tuttu")
• Dört hedef kartı (Bisiklet, Kitap, Almanca, Odak), durum etiketiyle (yolunda / geride)
• Seçili hedefin son 8 haftası: çubuk grafik, kesikli hedef çizgisi, ortalama / en iyi / kaçırılan
• Hedefin ceza kuralı, Cezalar'a bağlantı
Cezalar
• Bekleyen ceza kartı: ceza, sebep, geri sayım (14:02:37), "Yaptım" ve "Ertele (×2)"; Yaptım'a basılınca "Ceza kapandı" kartına dönüşür
• Kurallar: beş kural, her biri açılıp kapatılabilir; "+ Kural" yeni kural ekranını açar
• Geçmiş: yapılan cezalar ve sebepleri
Günlük
• Günün özet çipleri (25 km bisiklet, 1 sa 40 dk odak, 4/6 görev, 1 ceza bekliyor)
• Ruh hâli: Zor, Durgun, Normal, İyi, Harika
• Üç soru: Ne iyi gitti? Ne zorladı? Yarın için tek bir şey
• Kaydet düğmesi, önceki günler listesi, "Takvim" düğmesi
Ek ekranlar
Ek ekranların çoğu bir ana ekrandan açılır, alt menü yerine geri düğmesi ve altta sabit bir kaydet düğmesi taşır.
Ekran
Nereden açılır
Ne gösterir
İlerleme gir
Bugün · "+ İlerleme gir"
Hedef seçimi; miktar için − / + ve hızlı +5 / +10 / +25; "92 → 117 / 150 km" önizlemesi ve "Hedefe 33 km kaldı" sonucu; not alanı
İlerleme
Hedefler · "İlerleme"
Hafta / 12 hafta / Yıl seçimi; genel tamamlama (%79, +6 puan), eğilim çizgisi; 12 haftalık ısı haritası; dört hedefin toplamı ve değişimi; seriler (şu anki / en iyi); zaman dağılımı (Proje %46, Spor %24, Okuma %18, Dil %12); ceza özeti
Blok ekle
Hafta · "+ Blok", Blok detayı · "Düzenle"
Ad, kategori, günler (çoklu seçim), başlangıç–bitiş saati, her hafta tekrar, hedefe say + miktar, kaçırırsam ceza, hatırlatma; düğme "Programa ekle · 3 gün"
Blok detayı
Hafta · bir bloğa dokunma
Zaman, tekrar, kategori, hedef, hatırlatma, ceza; son 6 hafta (✓ / ✕, %83); "Bu hafta atla" (haftada 1 hak, ceza sayılmaz); onaylı silme
Hedef ekle
Hedefler · "+"
Ad, miktar, birim; Günlük / Haftalık / Aylık (özet cümlesi buna göre değişir); başlangıç; tutmazsa ceza; seri say
Ceza kuralı ekle
Cezalar · "+ Kural"
Tetikleyici (blok kaçınca / hedef tutmayınca / ertelenince); hangi blok veya hedef; ceza seçimi (soğuk duş, şınav, ekstra iş, ekran yasağı, telefonsuz, erken kalk); süre ve yapılmazsa ne olacağı; kuralın cümle olarak önizlemesi
Haftalık rapor
Hedefler · rapor kartı
Hafta 47: %82 (28 / 34 blok); gün grafiği, en iyi gün Perşembe; dört hedefin sonucu; cezalar 2/2; haftanın notu
Bildirimler
Bugün · zil
Bugün / dün gruplı liste; dört tür renkle ayrılır: hatırlatma, motivasyon, ceza, Claude değişikliği; her bildirim ilgili ekranı açar; "Tümü okundu"
Odak seansı bitti
Odak · "Seansı bitir"
"50 dakika tamam", haftalık odağa eklenen süre (4,5 → 5,3 / 15 sa), "Ne yaptın?", kaç kez bölündüğü; "Kaydet ve 10 dk mola"
Günlük takvimi
Günlük · "Takvim"
Kasım 2026 ay görünümü, günler ruh hâli rengiyle; seçilen günün notu ve istatistikleri
Ayarlar
Bugün · dişli
Bildirim türleri (4 anahtar), motivasyon sıklığı (Az / Orta / Çok), sessiz saatler, tema (Koyu / Açık / Sistem), Claude bağlantısı, ceza kuralları, yedeği indir (JSON)
Claude (MCP) bağlantısı
Claude programı MCP araçlarıyla değiştirir; uygulama her değişikliği gösterir, geri alınabilir kılar ve izin verilmeyen işlemleri kullanıcının onayına bağlar.
Claude bağlantısı ekranı
• MCP sunucusu kartı: "Bağlı" durumu, adres (https://takip.[ALAN-ADIN]/mcp), kopyala düğmesi, son erişim saati
• "1 değişiklik onayını bekliyor · İncele" kartı
• Claude'un yaptıkları: saat, araç adı ve değişiklik; her satırda Geri al / Yinele
• İzinler: blok ekleme ve değiştirme, blok silme, ceza kuralı değiştirme (her biri "doğrudan uygular" ya da "her seferinde onay ister"), günlüğü okuma (açık / kapalı)
• Claude'un kullanabildiği 12 araç: get_today, get_week, add_block, update_block, delete_block, log_progress, get_stats, set_goal, add_penalty_rule, resolve_penalty, write_journal, get_journal
Claude onayı ekranı
• Üstte araç adı (delete_block), saat ve işlem: "Almanca bloğunu sil"
• Kullanıcının Claude'a yazdığı cümle
• "Ne değişecek?": silinecek blok (ceza renginde) ve etkisi (haftalık Almanca hedefi 75 → 60, bu blok için ceza işlemez)
• Onayla / Reddet; seçimden sonra sonuç kartı ve Claude'a ne yanıt gönderildiği
Bağlantı koptu durumu
• "Bağlantı yok" kartı: program ve bildirimler çalışmaya devam eder, yalnızca Claude değişiklik yapamaz; son başarılı erişim ve hata (401 token süresi doldu)
• "Yeniden bağlan" düğmesi
• Kontrol listesi: sunucu ayakta, HTTPS sertifikası, yetkilendirme, Claude'daki bağlayıcı
Durumlar ve etkileşimler
Tasarımdaki ekranların çoğu Oynat modunda çalışır; aşağıdakiler tasarımın gösterdiği davranışlardır.
İlk açılış (boş durum)
"Bugün için program yok" kartı ve dört adım: ilk hedefini koy, haftalık programı kur, Claude'u bağla, bir ceza kuralı seç. Her adım ilgili ekranı açar; alt menü görünür kalır.
Odak figürü: dağ tırmanışı
Seçim
Dağ
Yükseklik
25 dk
Tepe
1.200 m
50 dk
Dağ
2.500 m
90 dk
Zirve
4.100 m
• Sahne: arkada sıra dağlar, önde ana dağ, zirvede kar, zikzak patika
• Patika iki katmanlıdır: kesikli tam yol ve geçen süre kadar dolan amber çizgi; işaretçi amber çizginin ucunda durur
• Süre dolunca zirveye bayrak dikilir, durum "zirvedesin — bayrak dikildi" olur
• Duraklatınca "mola · tırmanış duraklatıldı"; yarıda bırakılan tırmanış zirveye ulaşmadan biter
• Haftalık zirveler: tamamlanan seanslar yeşil, devam eden amber, gelecek olanlar soluk üçgenler
• Tasarım tırmanışın %62'sinde açılır; Tweaks'teki demoHizi açıkça her saniye bir dakika ilerler
Ceza akışı
1.  Blok kaçar ya da hedef tutmaz; kural açıksa ceza oluşur
2.  Bugün'de uyarı, Cezalar'da geri sayımlı kart, Bildirimler'de ceza bildirimi görünür
3.  "Yaptım" cezayı kapatır; "Ertele (×2)" cezayı iki katına çıkarır
4.  Blok detayındaki "Bu hafta atla" (haftada 1 hak) o blok için cezayı önler
Diğer etkileşimler
• Bugün: blok işaretleme, sayacı günceller
• Hafta: gün seçimi listeyi değiştirir
• Hedefler: hedef seçimi grafiği ve ceza kuralını değiştirir
• İlerleme: dönem seçimi tüm sayıları değiştirir
• Formlar: kategori, gün, dönem ve ceza seçimleri; anahtarlar
• Bildirimler: "Tümü okundu" vurguyu kaldırır
• Her ekranın Tweaks bölümünde tema seçimi (koyu / açık) vardır