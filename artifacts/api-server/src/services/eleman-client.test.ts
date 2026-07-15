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
