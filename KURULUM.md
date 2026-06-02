# Panelim — Kurulum Kılavuzu

Kişisel gelir-gider, takvim ve iş takip paneli. Bilgisayar + telefon, bulut senkronlu (PWA).

---

## 1) Hemen Dene (bilgisayarda, senkronsuz)

Klasörün içinde bir terminal açıp şunu çalıştır:

```bash
cd ~/Desktop/kisisel-dashboard
python3 -m http.server 8000
```

Tarayıcıda aç: **http://localhost:8000**

> Bu modda veriler sadece bu tarayıcıda saklanır (senkron yok). Telefonla senkron için 2. ve 3. adımları yap.

---

## 2) Bulut Senkronu Kur (Supabase — ücretsiz)

Telefon ve bilgisayar arasında senkron için ücretsiz bir Supabase projesi gerekir.

### a. Proje oluştur
1. https://supabase.com adresine git → **Sign up** (GitHub veya e-posta ile).
2. **New project** → bir isim ver, bir veritabanı parolası belirle, bölge olarak **Frankfurt (EU)** seç.
3. Proje açılınca sol menüden **Project Settings → API** bölümüne gir. Şunları kopyala:
   - **Project URL** (örn. `https://abcdxyz.supabase.co`)
   - **anon public** anahtarı (uzun `eyJ...` ile başlayan yazı)

### b. Bilgileri uygulamaya gir
`js/config.js` dosyasını aç ve iki satırı doldur:

```js
export const SUPABASE_URL = "https://abcdxyz.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

### c. Tabloları oluştur
Supabase'de sol menüden **SQL Editor → New query** aç, aşağıdaki kodu yapıştırıp **Run** de:

```sql
-- Tablolar
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  description text,
  category text,
  date date not null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date date not null,
  created_at timestamptz not null default now()
);

-- Güvenlik: herkes yalnızca kendi verisini görür/değiştirir
alter table transactions enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;

create policy "own_transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_tasks" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_events" on events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### d. E-posta doğrulamayı kapat (tek kullanıcı için pratik)
Sol menü **Authentication → Sign In / Providers → Email** altında
**"Confirm email"** seçeneğini **kapatırsan** kayıt olur olmaz giriş yapabilirsin.
(Açık bırakırsan, kayıt sonrası e-postandaki doğrulama linkine tıklaman gerekir.)

Artık uygulama açıldığında bir giriş ekranı gelir. **Yeni Hesap Oluştur** ile bir e-posta/parola belirle; aynı bilgilerle her cihazdan giriş yap.

---

## 3) Telefonda Kullan (PWA)

Telefonun uygulamayı "app gibi" açabilmesi için sayfanın **internette (HTTPS) yayında** olması gerekir. En kolay ücretsiz yol: **Netlify Drop**.

1. https://app.netlify.com/drop adresine git.
2. `kisisel-dashboard` klasörünü olduğu gibi sürükleyip bırak.
3. Sana `https://...netlify.app` gibi bir adres verir. (config.js'i doldurmuş olman gerekir.)
4. Bu adresi telefonda aç:
   - **iPhone (Safari):** Paylaş → **Ana Ekrana Ekle**.
   - **Android (Chrome):** Menü (⋮) → **Uygulamayı yükle / Ana ekrana ekle**.

Artık telefonda simgeden açıyorsun; bilgisayarda girdiğin veriler giriş yaptığın hesapta senkron görünür.

> config.js'i her güncellediğinde klasörü Netlify'a tekrar bırakman gerekir. (Kalıcı/otomatik dağıtım istersen GitHub + Netlify bağlanabilir — istersen yardımcı olurum.)

---

## Özellikler
- **Özet:** Bu ayki gelir/gider/net, bugünün işleri, son hareketler, toplam bakiye.
- **Gelir/Gider:** Tarih + kategori ile kayıt; aya göre filtre; tek tıkla sil.
- **Takvim:** Aylık görünüm; günlere göre hareket/iş/etkinlik noktaları; güne not ekleme.
- **İşler:** Yapılacaklar; tamamlandı işaretle (üstü çizilir) veya sil; tarihi geçenler kırmızı.
- **Ayarlar:** Mod (bulut/yerel), çıkış, tüm veriyi JSON yedekleme.
- Karanlık/aydınlık tema, mobil + masaüstü uyumlu.

## Veri güvenliği
- `anon` anahtarı tarayıcıda görünür olması **normaldir**; veriyi koruyan şey RLS (satır düzeyi güvenlik) politikalarıdır — her kullanıcı yalnızca kendi verisini görür.
- Yine de bu anahtarı herkese açık paylaşma.
