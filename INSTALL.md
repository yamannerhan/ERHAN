# Production Kurulumu

## Gereksinimler

- Ubuntu 22.04 veya 24.04
- En az 4 GB RAM; WhatsApp Chromium için 6 GB önerilir
- Domain: `ozelguvenlik.online`
- Sunucuya yönlenmiş TCP 80/443
- Geçerli e-posta (Let's Encrypt)

## DNS

Kurulumdan önce veya sonra:

1. `ozelguvenlik.online` için sunucu IPv4 adresine `A` kaydı ekleyin.
2. IPv6 gerçekten yapılandırılmışsa `AAAA` ekleyin; değilse eklemeyin.
3. `www` için ana domaine `CNAME` veya aynı IP'ye `A` kaydı ekleyin.
4. Eski Türkçe/Punycode domain yalnız ana domaine yönlenmelidir.
5. DNS yayılımını `dig +short ozelguvenlik.online` ile doğrulayın.

DNS hazır değilse Caddy sertifika almayı tekrar dener; kurulum servisleri silmez.

## GitHub'dan kurulum

```bash
git clone https://github.com/yamannerhan/ERHAN.git ozelguvenlik
cd ozelguvenlik
sudo bash install.sh
```

Script:

- Ubuntu sürümünü doğrular.
- Docker Engine ve Compose plugin kurar.
- `.env` oluşturur, rastgele DB/JWT/cron/admin secret üretir.
- Image build eder.
- PostgreSQL'i private networkte başlatır.
- Şemayı non-force `drizzle-kit push` ile uygular.
- Admin hesabını environment değerleriyle seed eder.
- Web, PostgreSQL ve Caddy'yi başlatır.
- Local readiness ve HTTPS kontrolü yapar.

İlk admin parolası yalnız kurulum sırasında gösterilir. Parolayı güvenli password manager'a kaydedin ve ilk girişten sonra değiştirin.

## Güvenli varsayılan mimari

Standart kurulum tek web replica içinde mevcut botları çalıştırır:

```env
RUN_BOT_WORKERS=1
```

Standalone worker executable'ları hazırdır fakat web→worker admin control RPC ve realtime bridge tamamlanmadan production varsayılanı yapılmamalıdır. `split-workers` profili yalnız staging denemesi içindir.

## Kontroller

```bash
sudo bash doctor.sh
docker compose --env-file .env ps
docker compose --env-file .env logs --since=10m web caddy postgres
curl -I https://ozelguvenlik.online/readyz
```

HTTPS ve HTTP→HTTPS yönlendirme tamamen doğrulandıktan sonra:

```env
ENABLE_HSTS=1
```

Ardından:

```bash
docker compose --env-file .env up -d web
```

HSTS, DNS/TLS doğrulanmadan açılmamalıdır.

## Production komutları

```bash
docker compose --env-file .env up -d
docker compose --env-file .env ps
docker compose --env-file .env logs -f web
sudo bash backup.sh
sudo bash update.sh
sudo bash doctor.sh
```

## Railway

- `railway.json` tek config kaynağıdır.
- `JWT_SECRET`, `CRON_SECRET`, `DATABASE_URL`, admin ve bot environment değerleri Railway Variables üzerinden kalıcı verilmelidir.
- Healthcheck `/readyz`.
- Tek replica kullanılmalıdır.
- WhatsApp için `WWEBJS_AUTH_PATH` konumuna persistent volume bağlanmalıdır.
- Railway TLS sonlandırdığı için ayrıca Caddy servisi gerekmez.
- Railway ephemeral filesystem nedeniyle uploadlar object storage veya volume olmadan kalıcı değildir.

