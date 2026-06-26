---
name: ÖzelGüvenlik listing parsing & gender field
description: Where salary/gender parsing lives and why gender is stored in the requirements text, not a column.
---

# Listing parsing (salary + gender)

- Single source of truth: `artifacts/api-server/src/lib/job-parsing.ts` exports `extractSalary()` + `extractGender()`. All ingestion paths import from here — do not re-implement inline.
- Three ingestion paths must stay consistent: scraper auto-publish (`workers/scraper.ts`), approval publish (`routes/pending-jobs.ts`, re-extracts from `rawText`), manual admin parse (`routes/admin.ts` parseListingText).

## Gender is stored in `requirements`, not a column
**Rule:** `listingsTable` (and `pendingJobsTable`) have NO gender column. Gender is embedded into the listing's `requirements` text field as `Cinsiyet: <Bay|Bayan|Bay / Bayan|Belirtilmemiş>`.
**Why:** adding a column would force OpenAPI + codegen + DB migration; the manual admin flow already used the `Cinsiyet: X` text convention, so embedding keeps all flows uniform with zero schema change.
**How to apply:** imported listings must ALWAYS include the `Cinsiyet:` line (fallback `Belirtilmemiş`). Frontend `listing-detail.tsx` renders `requirements` with `whitespace-pre-wrap`, so use `\n` to separate `Cinsiyet:` from `Kaynak:` etc.

## Scraper dedup, bot reset & re-parse
- **Imported listings are marked by `listingsTable.sourceTag`** (nullable: 'telegram'/'facebook'; manual listings = null). This is the ONLY reliable way to tell scraper listings apart for re-parse/dedup — requirements text ("Cinsiyet:"/"Kaynak:") is NOT reliable because manual flow also writes "Cinsiyet:".
- **Cross-group duplicate rule:** dedup is intentionally aggressive by **phone+city** (user wants the same job reposted in many Telegram groups to publish once). `createDuplicateHash` is phone-primary (`tel:phone|city`); `listingExistsForPhone(phone, city)` blocks publishing when an active listing already shares phone+city. **Why:** a security recruiter's contact number in one city ≈ one campaign. Tradeoff accepted: distinct same-phone+same-city jobs collapse into one.
- **"Botları Sıfırla" is NON-destructive to published listings.** Reset clears `imported_posts` + pending (status=pending) jobs, zeroes source counters, fires `triggerRescan()`. Re-scan re-reads channels; the phone+city dedup prevents re-adding already-published jobs. These two features are designed to work together — do not make reset delete listings.
- **`runScraperCycle` has an in-memory `cycleRunning` lock** so the 60s interval and a manual reset-triggered rescan can't overlap (no DB unique constraint on duplicate_hash — avoided to skip a risky migration over possibly-dirty existing data).
- **Re-parse preserves data:** `reparseImportedListings()` never wipes a field when re-extraction yields nothing — keeps existing salary/city/applyUrl, and preserves a previously-detected gender (and the "Kaynak:" line) when the new parse returns null.

## Parsing gotchas baked into job-parsing.ts
- Salary NUM pattern deliberately excludes bare 4-digit numbers (separator-form or 5-6 digits only) so years like "2024" and times like "08.00-18.00" are not mistaken for salary.
- Gender uses `\b` word boundaries so `bay` does not match inside `bayan`. Female = bayan/kadın/hanım, male = bay/erkek.
- Always lowercase with `toLocaleLowerCase("tr-TR")` for correct İ/Ş folding.
