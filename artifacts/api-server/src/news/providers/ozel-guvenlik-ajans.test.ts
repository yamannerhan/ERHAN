import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ozelGuvenlikAjansProvider } from "./ozel-guvenlik-ajans";

describe("ozel guvenlik ajans provider", () => {
  it("lists guncel articles with urls", async () => {
    const list = await ozelGuvenlikAjansProvider.getArticleList({
      baseUrl: "https://www.ozelguvenlikajans.com",
      listingUrl: "https://www.ozelguvenlikajans.com/haberler/guncel/",
    });
    assert.ok(list.length >= 5, `expected many articles, got ${list.length}`);
    assert.ok(list.every((x) => /\/haber\/.+\.html$/i.test(x.sourceUrl)));
  });

  it("extracts title cover excerpt and body", async () => {
    const list = await ozelGuvenlikAjansProvider.getArticleList({
      baseUrl: "https://www.ozelguvenlikajans.com",
      listingUrl: "https://www.ozelguvenlikajans.com/haberler/guncel/",
    });
    const first = list[0];
    assert.ok(first);
    const article = await ozelGuvenlikAjansProvider.getArticleDetail(first.sourceUrl, {
      lastmod: first.lastmod,
    });
    assert.ok(article);
    assert.ok((article!.title || "").length >= 8);
    assert.ok((article!.excerpt || "").length >= 20);
    assert.ok((article!.contentHtml || "").length >= 80);
    assert.ok(article!.coverImage && /^https?:\/\//i.test(article!.coverImage));
  });
});
