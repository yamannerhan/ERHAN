import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTurkishPhone,
  contentHash,
  isNewerThanCheckpoint,
  compareMessages,
  daysAgoUnixSeconds,
  resolveAuthPath,
  volumeWarning,
} from "./whatsapp.client";
import { classifySecurityJob } from "./whatsapp.classifier.service";
import { HISTORY_DAYS, SCAN_INTERVAL_MS, SESSION_ID, EXPIRE_DAYS } from "./whatsapp.types";

test("defaults: session main-whatsapp, 15 gün, 10 dk", () => {
  assert.equal(SESSION_ID, "main-whatsapp");
  assert.equal(HISTORY_DAYS, 15);
  assert.equal(EXPIRE_DAYS, 15);
  assert.equal(SCAN_INTERVAL_MS, 10 * 60 * 1000);
});

test("telefon normalizasyonu QR/Pairing için 90 önek", () => {
  assert.equal(normalizeTurkishPhone("0532 111 22 33"), "905321112233");
  assert.equal(normalizeTurkishPhone("5321112233"), "905321112233");
  assert.equal(normalizeTurkishPhone("+90 505 266 19 96"), "905052661996");
  assert.equal(normalizeTurkishPhone("905321112233"), "905321112233");
  assert.equal(normalizeTurkishPhone("123"), null);
  assert.equal(normalizeTurkishPhone(""), null);
});

test("telefon maskeleme tam numarayı göstermez", async () => {
  const { maskPhone } = await import("./whatsapp.client");
  assert.equal(maskPhone("905052661996"), "905******996");
  assert.ok(!String(maskPhone("905052661996")).includes("05266"));
});

test("cache corruption sınıflandırması", async () => {
  const { classifyWhatsAppError } = await import("./whatsapp.client");
  const c = classifyWhatsAppError(
    "Invariant Violation: Minified invariant #56367\ngetStorage\ngetUserPrefsTable\nallUserPrefsIdb\nstatic.whatsapp.net",
  );
  assert.equal(c.code, "CACHE_PROFILE_CORRUPTED");
  assert.equal(c.corrupted, true);
});

test("classifier: güvenlik ilanı kabul, iş arayan red", () => {
  const job = classifySecurityJob(
    "Özel güvenlik görevlisi aranıyor. İstanbul. Maaş 35000. Vardiya. Başvuru 05321112233",
  );
  assert.equal(job.isJobPosting, true);

  const seeker = classifySecurityJob("Güvenlik işi arıyorum tecrübeli SGK");
  assert.equal(seeker.isJobPosting, false);

  const spam = classifySecurityJob("Gunaydin millet hayirli sabahlar");
  assert.equal(spam.isJobPosting, false);
});

test("duplicate: content hash aynı metin için aynı", () => {
  assert.equal(contentHash("Özel Güvenlik  Aranıyor!!!"), contentHash("özel güvenlik aranıyor"));
});

test("checkpoint: aynı saniye farklı id yeni sayılır", () => {
  assert.equal(
    isNewerThanCheckpoint(100, "b", { messageId: "a", timestamp: 100 }),
    true,
  );
  assert.equal(
    isNewerThanCheckpoint(99, "z", { messageId: "a", timestamp: 100 }),
    false,
  );
  assert.ok(compareMessages({ id: "a", timestamp: 1 }, { id: "b", timestamp: 2 }) < 0);
  assert.ok(daysAgoUnixSeconds(15) < Math.floor(Date.now() / 1000));
});

test("auth path varsayılanı env olmadan çalışır", () => {
  const path = resolveAuthPath();
  assert.ok(path.includes("whatsapp-auth") || path.includes(".wwebjs_auth"));
  // volumeWarning yerel ortamda null veya string olabilir — kapanma yok
  const warn = volumeWarning(path);
  assert.ok(warn === null || typeof warn === "string");
});
