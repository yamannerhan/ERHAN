# ERHAN - Özel Güvenlik İş İlanları Platformu

Özel güvenlik sektörüne özel iş ilanları ve sosyal platform uygulaması.

## Özellikler

- 🔐 Kullanıcı kayıt/giriş sistemi
- 📋 İş ilanları yönetimi
- 💬 Gerçek zamanlı sohbet (Socket.io)
- 🤖 Otomatik Telegram ilan çekme
- 📱 Responsive web arayüzü
- 👮 Admin paneli

## Teknolojiler

- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL, Drizzle ORM
- **Real-time:** Socket.io
- **Frontend:** React, Vite, Tailwind CSS
- **Deployment:** Railway

## Railway'de Kurulum

### 1. GitHub Repo Bağlama

1. Railway dashboard'a giriş yapın: https://railway.app
2. "New Project" → "Deploy from GitHub repo"
3. `yamannerhan/ERHAN` reposunu seçin

### 2. PostgreSQL Ekleme

1. Proje içinde "New" → "Database" → "Add PostgreSQL"
2. Railway otomatik `DATABASE_URL` ortam değişkenini oluşturacak

### 3. Ortam Değişkenleri

Railway dashboard → Variables sekmesine şunları ekleyin:

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `DATABASE_URL` | PostgreSQL bağlantı URL | Railway otomatik oluşturur |
| `SESSION_SECRET` | Session şifreleme anahtarı | `your-secret-key-32-chars` |
| `JWT_SECRET` | JWT token anahtarı | `your-jwt-secret-32-chars` |
| `PORT` | Sunucu portu | Railway otomatik ayarlar |
| `NODE_ENV` | Ortam | `production` |

**Opsiyonel (Telegram entegrasyonu için):**
| `TELEGRAM_API_ID` | Telegram API ID | `12345678` |
| `TELEGRAM_API_HASH` | Telegram API Hash | `abc123...` |
| `TELEGRAM_BOT_TOKEN` | Bot token | `123456:ABC...` |
| `TELEGRAM_CHANNEL_USERNAME` | Kanal kullanıcı adı | `@ozelguvenlikilan` |

### 4. Deploy

Otomatik deploy başlayacaktır. Logları "Deployments" sekmesinden izleyebilirsiniz.

### 5. Veritabanı Migration

Railway CLI veya dashboard üzerinden:

```bash
# Railway CLI kurulumu
npm install -g @railway/cli

# Login
railway login

# Projeye bağlan
railway link

# Shell aç
railway shell

# Migration çalıştır
cd lib/db
pnpm drizzle-kit push
```

## Lokal Geliştirme

### Gereksinimler

- Node.js 22+
- pnpm 9+
- PostgreSQL 16+

### Kurulum

```bash
# Repoyu klonla
git clone https://github.com/yamannerhan/ERHAN.git
cd ERHAN

# Bağımlılıkları yükle
pnpm install

# Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını düzenle

# Veritabanını hazırla
cd lib/db
pnpm drizzle-kit push
cd ../..

# Geliştirme sunucusunu başlat
pnpm dev
```

### Portlar

- API Server: 3000 (PORT değişkeni ile ayarlanır)

## Proje Yapısı

```
.
├── artifacts/
│   ├── api-server/          # Backend API
│   └── mockup-sandbox/      # Frontend uygulama
├── lib/
│   ├── db/                  # Database schema ve ORM
│   ├── api-zod/             # API validasyon şemaları
│   └── api-client-react/    # React API client
├── package.json             # Root package.json
├── pnpm-workspace.yaml      # pnpm workspace config
└── railway.json             # Railway deployment config
```

## API Endpoints

- `GET /api/health` - Sağlık kontrolü
- `POST /api/auth/register` - Kayıt
- `POST /api/auth/login` - Giriş
- `GET /api/listings` - İlanları listele
- `GET /api/chat/messages` - Sohbet mesajları
- WebSocket: `/ws` - Gerçek zamanlı sohbet

## Lisans

MIT
