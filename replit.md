# ÖzelGüvenlik.Online

Türkiye'nin özel güvenlik sektörüne özel iş ilanları ve topluluk platformu — PWA, canlı sohbet, admin paneli.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/ozel-guvenlik run dev` — Frontend (port 23785)
- `pnpm run typecheck` — tüm paketlerde tip kontrolü
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — OpenAPI'dan hook ve Zod şemalarını yeniden üret
- `pnpm --filter @workspace/db run push` — DB şema değişikliklerini uygula (sadece dev)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io (WS path: `/ws`)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Tailwind CSS + Framer Motion
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Auth: JWT (Bearer token), `SESSION_SECRET` env var

## Where things live

- `lib/api-spec/openapi.yaml` — kaynak API sözleşmesi
- `lib/db/src/schema/` — Drizzle ORM şema dosyaları
- `lib/api-client-react/` — Orval tarafından üretilen React Query hook'ları
- `artifacts/api-server/src/routes/` — tüm backend route'ları
- `artifacts/ozel-guvenlik/src/pages/` — tüm frontend sayfaları
- `artifacts/ozel-guvenlik/src/contexts/AuthContext.tsx` — JWT auth state

## Architecture decisions

- JWT (Bearer token) tabanlı stateless auth — session cookie kullanılmıyor
- Socket.io `/ws` path üzerinden çalışır, artifact.toml'a eklenmiş
- Fake online sayısı: `admin_settings.fake_online_bonus` DB alanı + gerçek bağlantı sayısı
- Listings API'si `ANY()` yerine Drizzle'ın `inArray()` kullanır (SQL uyumluluğu)
- Frontend query hook'ları her zaman `queryKey` prop'u ile çağrılmalı

## Product

- İş ilanları: listeleme, arama, şehir filtresi, öne çıkarma, beğeni/favori
- Canlı sohbet: Socket.io, @mention vurgulama, yanıt, admin rozeti, renkli/animasyonlu isimler
- Admin paneli: kullanıcı yönetimi, ilan moderasyonu, sahte beğeni, fake online sayısı
- PWA: manifest.json, dark theme, glassmorphism tasarım

## User preferences

- Tam Türkçe arayüz, emoji kullanılmaz
- Dark theme: #0F172A bg, #1E293B cards, #4F46E5 primary, #7C3AED violet, #06B6D4 cyan
- Mobile-first PWA

## Gotchas

- Socket.io artifact.toml'da `/ws` path'ine ihtiyaç duyar
- `useGetXxx` hook'ları çağrılırken `queryKey: getGetXxxQueryKey()` mutlaka verilmeli
- DB şema değiştikçe `pnpm --filter @workspace/db run push` + API server rebuild gerekir
- API server build edilmeden restart edilemez (`pnpm run build` önce çalışmalı)

## Pointers

- Workspace yapısı için `pnpm-workspace` skill'ine bakın
