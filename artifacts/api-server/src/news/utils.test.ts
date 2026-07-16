import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanNewsTitle, decodeHtmlEntities, makeExcerpt, resolveNewsImageUrl, sanitizeNewsHtml, slugifyTr, sourceHash, stripHtml } from "./utils";

describe("news utils", () => {
  it("slugifies turkish titles", () => {
    assert.equal(slugifyTr("Özel Güvenlik Sınavı 2026"), "ozel-guvenlik-sinavi-2026");
  });

  it("cleans source site name from titles", () => {
    assert.equal(
      cleanNewsTitle("Özel Güvenlik Sınavı | Güvenlik Akademi"),
      "Özel Güvenlik Sınavı",
    );
    assert.equal(
      cleanNewsTitle("Antalya Otogarında Saldırı - Güvenlik Akademisi"),
      "Antalya Otogarında Saldırı",
    );
  });

  it("resolves relative cover urls", () => {
    assert.equal(
      resolveNewsImageUrl("/admin/uploads/posts/a.webp", "https://guvenlikakademi.com/haber"),
      "https://guvenlikakademi.com/admin/uploads/posts/a.webp",
    );
  });

  it("decodes html entities", () => {
    assert.equal(decodeHtmlEntities("Terminali&#039;nde"), "Terminali'nde");
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
