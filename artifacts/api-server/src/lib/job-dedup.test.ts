import assert from "node:assert/strict";
import test from "node:test";
import {
  createDuplicateHash,
  isLikelyDuplicateJob,
  normalizeJobContentForDedup,
} from "./job-dedup";

test("dedup: yalnızca birebir aynı normalize metin çift sayılır", () => {
  const a = "İstanbul Avrupa\nÖzel güvenlik aranıyor\nTel: 0532 111 22 33\nMaaş: 25000";
  const b = "İstanbul Avrupa\nÖzel güvenlik aranıyor\nTel: 0532 111 22 33\nMaaş: 25000";
  const similar = "İstanbul Anadolu\nÖzel güvenlik aranıyor\nTel: 0532 111 22 33\nMaaş: 25000";

  assert.equal(createDuplicateHash(a), createDuplicateHash(b));
  assert.equal(isLikelyDuplicateJob(a, b), true);
  assert.notEqual(createDuplicateHash(a), createDuplicateHash(similar));
  assert.equal(isLikelyDuplicateJob(a, similar), false);
});

test("dedup: aynı telefon/firma benzer metinde tek başına çift değildir", () => {
  const a = "Firma X — Kadıköy gece vardiyası güvenlik\n05321112233";
  const b = "Firma X — Beşiktaş gündüz vardiyası güvenlik\n05321112233";
  assert.equal(isLikelyDuplicateJob(a, b), false);
});

test("dedup: normalize boşluk/emoji farkını yok sayar, içerik farkını korur", () => {
  const a = normalizeJobContentForDedup("Merhaba   Dünya\n\nİlan");
  const b = normalizeJobContentForDedup("merhaba dünya\n\nilan");
  assert.equal(a, b);
  assert.notEqual(
    normalizeJobContentForDedup("Merhaba Ankara"),
    normalizeJobContentForDedup("Merhaba İzmir"),
  );
});
