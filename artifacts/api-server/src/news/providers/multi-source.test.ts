import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ogghaberProvider } from "./ogghaber";
import { egmHaberlerProvider, egmDuyurularProvider } from "./egm";
import { ozelGuvenlikAjansProvider } from "./ozel-guvenlik-ajans";

describe("multi-source news providers", () => {
  it("ajans lists recent articles", async () => {
    const list = await ozelGuvenlikAjansProvider.getArticleList({
      baseUrl: "https://www.ozelguvenlikajans.com",
      listingUrl: "https://www.ozelguvenlikajans.com/haberler/guncel/",
    });
    assert.ok(list.length >= 3);
  });

  it("ogghaber lists and details", async () => {
    const list = await ogghaberProvider.getArticleList({
      baseUrl: "https://www.ogghaber.net",
      listingUrl: "https://www.ogghaber.net/",
    });
    assert.ok(list.length >= 5, `ogghaber list ${list.length}`);
    const article = await ogghaberProvider.getArticleDetail(list[0]!.sourceUrl, {
      lastmod: list[0]!.lastmod,
    });
    assert.ok(article);
    assert.ok(article!.title.length >= 8);
    assert.ok(article!.excerpt.length >= 8);
  });

  it("egm haberler lists cards", async () => {
    const list = await egmHaberlerProvider.getArticleList({
      baseUrl: "https://www.egm.gov.tr",
      listingUrl: "https://www.egm.gov.tr/ozelguvenlik/haberler",
    });
    assert.ok(list.length >= 1, `egm haberler ${list.length}`);
    const article = await egmHaberlerProvider.getArticleDetail(list[0]!.sourceUrl, {
      lastmod: list[0]!.lastmod,
    });
    assert.ok(article);
    assert.ok(article!.title.length >= 8);
    assert.ok(article!.excerpt.length >= 8);
  });

  it("egm duyurular lists announcements", async () => {
    const list = await egmDuyurularProvider.getArticleList({
      baseUrl: "https://www.egm.gov.tr",
      listingUrl: "https://www.egm.gov.tr/ozelguvenlik/duyurular",
    });
    assert.ok(list.length >= 3, `egm duyurular ${list.length}`);
  });
});
