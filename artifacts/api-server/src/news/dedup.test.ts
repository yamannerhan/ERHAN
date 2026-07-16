import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentFingerprint, normalizeCanonical, textSimilarity, titleKey } from "./dedup-core";

describe("news dedup helpers", () => {
  it("normalizes canonical urls", () => {
    assert.equal(
      normalizeCanonical("https://www.Ogghaber.net/haber/foo-1/"),
      "https://ogghaber.net/haber/foo-1",
    );
    assert.equal(
      normalizeCanonical("//www.egm.gov.tr/ozelguvenlik/x"),
      "https://egm.gov.tr/ozelguvenlik/x",
    );
  });

  it("matches similar titles", () => {
    assert.equal(
      titleKey("Özel Güvenlik Haftası Mesajı"),
      titleKey("Özel Güvenlik Haftası Mesajı!!!"),
    );
    assert.ok(textSimilarity(
      "Kadın özel güvenlik görevlileri için protokol imzalandı",
      "Kadın özel güvenlik görevlileri için protokol imzalandı Ankara'da",
    ) > 0.7);
  });

  it("fingerprints content stably", () => {
    const a = contentFingerprint("<p>Merhaba dünya test haber</p>");
    const b = contentFingerprint("Merhaba  dünya   test haber");
    assert.equal(a, b);
  });
});
