import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanNewsTitle, makeExcerpt, sanitizeNewsHtml, slugifyTr, sourceHash, stripHtml } from "./utils";

describe("news utils", () => {
  it("slugifies turkish titles", () => {
    assert.equal(slugifyTr("Özel Güvenlik Sınavı 2026"), "ozel-guvenlik-sinavi-2026");
  });

  it("strips source brand from titles", () => {
    assert.equal(
      cleanNewsTitle("Özel Güvenlik Maaşları - Güvenlik Akademi"),
      "Özel Güvenlik Maaşları",
    );
    assert.ok(!/akademi/i.test(cleanNewsTitle("Güvenlik Akademi: Sınav Sonuçları")));
  });

  it("builds stable source hash", () => {
    const a = sourceHash({ sourceUrl: "https://x.com/a", title: "Başlık", excerpt: "Özet" });
    const b = sourceHash({ sourceUrl: "https://x.com/a", title: "Başlık", excerpt: "Özet" });
    const c = sourceHash({ sourceUrl: "https://x.com/b", title: "Başlık", excerpt: "Özet" });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("sanitizes dangerous html", () => {
    const dirty = `<p>Merhaba</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>`;
    const clean = sanitizeNewsHtml(dirty);
    assert.ok(!clean.includes("<script"));
    assert.ok(!clean.toLowerCase().includes("onerror"));
    assert.ok(!clean.toLowerCase().includes("javascript:"));
  });

  it("makes excerpt", () => {
    const e = makeExcerpt("a".repeat(300), 50);
    assert.ok(e.length <= 50);
    assert.ok(e.endsWith("…"));
  });

  it("strips html", () => {
    assert.equal(stripHtml("<p>Merhaba <b>dünya</b></p>"), "Merhaba dünya");
  });
});
