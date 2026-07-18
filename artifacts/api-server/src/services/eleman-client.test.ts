import assert from "node:assert/strict";
import test from "node:test";

process.env["ELEMAN_REQUEST_RETRIES"] = "1";
process.env["ELEMAN_REQUEST_TIMEOUT_MS"] = "5000";
const originalFetch = globalThis.fetch;
const client = await import("./eleman-client");

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("Eleman.net HTTP hatası boş sonuç gibi kabul edilmez", async () => {
  globalThis.fetch = async () => new Response("geçici hata", { status: 503 });
  await assert.rejects(
    () => client.fetchElemanListPage("istanbul", 1),
    (error: unknown) => error instanceof client.ElemanTransportError && error.status === 503,
  );
});

test("Eleman.net başarılı boş sayfa güvenli biçimde boş liste döndürür", async () => {
  globalThis.fetch = async () => new Response("<html><body></body></html>", { status: 200 });
  assert.deepEqual(await client.fetchElemanListPage("istanbul", 1), []);
});

test("Eleman cursor: city|page|id|url round-trip ve eski colon formatı", () => {
  const url = "https://www.eleman.net/ilan/ozel-guvenlik-12345";
  const encoded = client.formatElemanCursor(3, 7, "12345", url);
  assert.equal(encoded, `3|7|12345|${encodeURIComponent(url)}`);
  assert.deepEqual(client.parseElemanCursor(encoded), {
    cityIndex: 3,
    page: 7,
    lastListingId: "12345",
    lastListingUrl: url,
  });

  assert.deepEqual(client.parseElemanCursor("12:4"), {
    cityIndex: 12,
    page: 4,
    lastListingId: "",
    lastListingUrl: "",
  });
  assert.deepEqual(client.parseElemanCursor("12:4:999"), {
    cityIndex: 12,
    page: 4,
    lastListingId: "999",
    lastListingUrl: "",
  });
  assert.deepEqual(client.parseElemanCursor(null), {
    cityIndex: 0,
    page: 1,
    lastListingId: "",
    lastListingUrl: "",
  });
});

test("Eleman şehir listesi dolu (tüm iller)", () => {
  assert.ok(client.elemanCityCount() >= 80);
  assert.ok(client.getElemanCityByIndex(0));
  assert.equal(client.getElemanCityByIndex(client.elemanCityCount()), null);
});
