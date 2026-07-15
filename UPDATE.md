# Güncelleme ve Rollback

## Otomatik güvenli güncelleme

```bash
cd /opt/ozelguvenlik   # gerçek proje yolunu kullanın
sudo bash update.sh
```

Akış:

1. Tracked çalışma alanının temiz olduğunu doğrular.
2. PostgreSQL, uploads, app-data ve WhatsApp session yedeği alır.
3. `origin/main` branchini `--ff-only` günceller.
4. Image build eder.
5. Şemayı non-force uygular.
6. Servisleri yeniden başlatır.
7. `/readyz` kontrolü yapar.

Build/migration/health başarısızsa script önceki Git commitine döner, eski image'ı yeniden build eder ve servisleri başlatır. Şema geri dönüşü otomatik yapılmaz; veri güvenliği için alınan backup yolu loglanır.

## Manuel rollback

Önce log ve backupı doğrulayın:

```bash
docker compose --env-file .env logs --since=30m web postgres
ls -la backups/
```

Yalnız uygulama kodunu geri almak:

```bash
git log --oneline -10
git reset --hard <ONCEKI_COMMIT>
docker compose --env-file .env build
docker compose --env-file .env up -d
sudo bash doctor.sh
```

Veritabanı da geri alınmalıysa:

```bash
sudo bash restore.sh /tam/proje/backups/<YEDEK_ZAMANI> --confirm-restore
```

Restore mevcut veriyi değiştirir ve önce otomatik güvenlik yedeği alır.

## Güncelleme sonrası

```bash
docker compose --env-file .env ps
curl -fsS https://ozelguvenlik.online/readyz
sudo bash doctor.sh
```

WhatsApp session, Telegram bağlantısı, yeni ilan idempotency ve admin erişimi staging/production smoke testinde ayrıca kontrol edilmelidir.

