import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTurkishWhatsAppPhone, isValidWaPhone, maskPhone } from "./phone";
import { classifySecurityJob } from "./classifier";
import { contentHash, normalizeJobContent } from "./content-hash";
import { isMessageNewerThanCheckpoint, compareMessages, daysAgoUnixSeconds } from "./checkpoint";

test("Türkiye WhatsApp telefonu 90 önekine çevrilir", () => {
  assert.equal(normalizeTurkishWhatsAppPhone("+90 (532) 111-22-33"), "905321112233");
  assert.equal(normalizeTurkishWhatsAppPhone("0532 111 22 33"), "905321112233");
  assert.equal(normalizeTurkishWhatsAppPhone("5321112233"), "905321112233");
  assert.equal(normalizeTurkishWhatsAppPhone("5052661996"), "905052661996");
  assert.ok(isValidWaPhone("905321112233"));
  assert.equal(isValidWaPhone("123"), false);
  assert.equal(maskPhone("905321112233"), "9053****33");
});

test("classifier güvenlik ilanı kabul eder, iş arayanı reddeder", () => {
  const job = classifySecurityJob(
    "Özel güvenlik görevlisi aranıyor. İstanbul Anadolu. Maaş 35000 TL. Vardiya. Başvuru: 0532 111 22 33",
  );
  assert.equal(job.isJobPosting, true);

  const seeker = classifySecurityJob("Güvenlik işi arıyorum 5 yıl tecrübeli SGK'lı");
  assert.equal(seeker.isJobPosting, false);
});

test("content hash normalize eder", () => {
  const a = contentHash("Özel Güvenlik  Aranıyor!!!");
  const b = contentHash("özel güvenlik aranıyor");
  assert.equal(a, b);
  assert.equal(normalizeJobContent("A  B"), "a b");
});

test("checkpoint sıralaması timestamp + messageId", () => {
  assert.equal(
    isMessageNewerThanCheckpoint(100, "b", { messageId: "a", timestamp: 100 }),
    true,
  );
  assert.equal(
    isMessageNewerThanCheckpoint(99, "z", { messageId: "a", timestamp: 100 }),
    false,
  );
  assert.ok(compareMessages({ id: "a", timestamp: 1 }, { id: "b", timestamp: 2 }) < 0);
  assert.ok(daysAgoUnixSeconds(15) < Math.floor(Date.now() / 1000));
});
