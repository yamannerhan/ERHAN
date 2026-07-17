import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isChannelNoisePost, isSecurityJobPosting } from "../lib/job-parsing";

describe("telegram kanal gürültüsü vs gerçek ilan", () => {
  it("rejects welcome / rules mentioning özel güvenlik", () => {
    assert.equal(
      isChannelNoisePost("Hoşgeldiniz! Bu grup özel güvenlik ilanları içindir. Kurallara uyun."),
      true,
    );
    assert.equal(
      isChannelNoisePost("Grup kuralları: sadece ilan paylaşın, reklam yasak. Özel güvenlik kanalı."),
      true,
    );
  });

  it("accepts real hiring even with short text", () => {
    assert.equal(
      isSecurityJobPosting("İstanbul özel güvenlik görevlisi aranıyor. Vardiya 12/24. Servis var."),
      true,
    );
  });

  it("does not treat channel noise as security job", () => {
    assert.equal(
      isSecurityJobPosting("Bu kanal özel güvenlik topluluğudur. Üyeler için bilgilendirme yapılır."),
      false,
    );
  });
});
