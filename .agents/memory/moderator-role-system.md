---
name: Moderatör Rol Sistemi
description: Moderatör rolü izin sınırları, listing_publish_grants tablosu, grant sistemi ve frontend moderatör paneli.
---

## Kural

`requireAdminOrModerator` middleware kullanılır: stats, users, ban/unban, listings CRUD, parse/publish.

**Why:** Moderatörler ilan yönetimi ve kullanıcı yasaklama yapabilir ama banner/ayar/grant yönetemez.

## İzin sınırları (test edildi)

| Endpoint | Admin | Moderatör | Grant sahibi |
|---|---|---|---|
| GET /admin/listings | ✅ | ✅ | ✅ |
| POST /admin/listings/parse | ✅ | ✅ | ✅ |
| POST /admin/listings | ✅ | ✅ | ✅ (grant düşer) |
| PATCH /admin/listings/:id/status | ✅ | ✅ | ❌ |
| DELETE /admin/listings/:id | ✅ | ✅ | ❌ |
| POST /admin/users/:id/ban | ✅ | ✅ (sadece "user" rolü) | ❌ |
| GET /admin/banners | ✅ | ❌ (403) | ❌ |
| GET /admin/grants | ✅ | ❌ (403) | ❌ |

## Grant sistemi

- Tablo: `listing_publish_grants` (lib/db/src/schema/grants.ts)
- Türler: `unlimited` | `limited` | `timed`
- `checkPublishPermission(userId, role)` — admin.ts içinde helper, grant tablosunu sorgular
- `POST /admin/listings` sonrası `limited` grant ise `uses_remaining - 1` yapılır
- `GET /users/my-publish-grant` — kullanıcı kendi durumunu sorgular

## Frontend

- `/moderator` sayfası: Akıllı İlan Oluştur + İlan Yönetimi + Kullanıcı Yönetimi
- Header'da Moderatör nav linki (sarı, sadece moderatör rolünde)
- Admin panelinde "Yetki Yönetimi" section (grant ver/iptal)
- `AuthContext.isModerator: user?.role === "moderator"`

## How to apply

- Yeni route admin-only olacaksa: `requireAdmin`
- Moderatöre açılacaksa: `requireAdminOrModerator`
- Parse/publish endpoint: `authMiddleware` + `checkPublishPermission` inline
- Moderatör ban: sadece `role === "user"` olanlar yasaklanabilir
