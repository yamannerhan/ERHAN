# Backup ve Restore

## Yedek kapsamı

`backup.sh` şunları içerir:

- PostgreSQL custom-format dump
- Telegram session ve bot state (PostgreSQL dump içinde)
- Upload/media volume
- Uygulama data volume
- WhatsApp LocalAuth session
- Git commit ve UTC zaman manifesti
- SHA-256 checksum

`.env` yedeğe bilinçli olarak dahil edilmez. Secretlar ayrı, şifreli password manager veya secret vault içinde tutulmalıdır.

## Yedek alma

```bash
sudo bash backup.sh
```

Yedekler:

```text
backups/YYYYMMDDTHHMMSSZ/
```

Klasörü sunucu dışında şifreli object storage'a aktarın. Aynı disk üzerindeki backup donanım arızasına karşı koruma sağlamaz.

## Doğrulama

```bash
cd backups/<YEDEK_ZAMANI>
sha256sum -c SHA256SUMS
```

En az aylık olarak disposable bir sunucuda tam restore drill yapılmalıdır.

## Restore

```bash
sudo bash restore.sh /tam/proje/backups/<YEDEK_ZAMANI> --confirm-restore
```

Restore:

1. Checksumları doğrular.
2. Mevcut durumun yeni güvenlik yedeğini alır.
3. Web/Caddy/workerı durdurur.
4. PostgreSQL dumpı `--clean --if-exists` ile yükler.
5. Media ve WhatsApp session arşivlerini volume üzerine açar.
6. Servisleri başlatır ve readiness kontrolü yapar.

## Restore sonrası kontrol

```bash
sudo bash doctor.sh
docker compose --env-file .env logs --since=15m web postgres
```

Manuel doğrulama:

- Admin login
- Aktif ilan sayısı ve son ilan
- Upload görselleri
- Telegram session bağlantısı
- WhatsApp session bağlantısı
- Duplicate message/external ID davranışı
- Yeni backup alma

## Saklama önerisi

- Günlük: 7
- Haftalık: 4
- Aylık: 6

Silme politikası otomatik eklenmedi; yanlış backup silme riskini önlemek için retention harici backup sistemi tarafından yönetilmelidir.

