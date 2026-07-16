import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

process.env["JWT_SECRET"] = "security-test-secret-must-be-at-least-32-characters";
process.env["APP_ORIGINS"] = "https://ozelguvenlik.online";
process.env["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:1/test";
process.env["NODE_ENV"] = "production";

const { verifyAuthToken, signToken } = await import("../middlewares/auth");
const { createRateLimit, isAllowedOrigin, redactProductionErrors, verifyMutationOrigin } = await import("../middlewares/security");
const { isSafeGeneratedJpegName, safePublicUrl } = await import("./safe-url");

test("unsafe public URL şemaları reddedilir", () => {
  assert.equal(safePublicUrl("javascript:alert(1)"), null);
  assert.equal(safePublicUrl("//evil.example/x"), null);
  assert.equal(safePublicUrl("data:text/html;base64,WA==", { allowImageData: true }), null);
  assert.equal(safePublicUrl("/ilan/12"), "/ilan/12");
  assert.equal(safePublicUrl("https://example.com/a"), "https://example.com/a");
});

test("part-time fotoğraf adı traversal kabul etmez", () => {
  assert.equal(isSafeGeneratedJpegName("12_0123456789abcdef01234567.jpg"), true);
  for (const value of ["../../.env", "..%2f.env", "..\\..\\.env", "/etc/passwd", "12_x.jpg"]) {
    assert.equal(isSafeGeneratedJpegName(value), false);
  }
});

test("origin allowlist yalnız tanımlı origin'i kabul eder", () => {
  assert.equal(isAllowedOrigin("https://ozelguvenlik.online"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin(undefined), true);
});

test("cross-site mutation origin guard tarafından reddedilir", () => {
  let statusCode = 200;
  let nextCalled = false;
  const req = {
    method: "POST",
    header(name: string) {
      if (name === "origin") return "https://evil.example";
      if (name === "sec-fetch-site") return "cross-site";
      return undefined;
    },
  };
  const res = {
    status(code: number) { statusCode = code; return this; },
    json() { return this; },
  };
  verifyMutationOrigin(req as never, res as never, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test("rate limit sınırdan sonra 429 ve Retry-After döndürür", () => {
  const limiter = createRateLimit({ windowMs: 60_000, max: 2 });
  const headers = new Map<string, string>();
  let statusCode = 200;
  let nextCount = 0;
  const req = { ip: "127.0.0.1" };
  const res = {
    setHeader(name: string, value: string) { headers.set(name, value); },
    status(code: number) { statusCode = code; return this; },
    json() { return this; },
  };
  limiter(req as never, res as never, () => { nextCount += 1; });
  limiter(req as never, res as never, () => { nextCount += 1; });
  limiter(req as never, res as never, () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(statusCode, 429);
  assert.ok(Number(headers.get("Retry-After")) >= 1);
});

test("JWT issuer/audience doğrulanır ve eski fallback anahtarı reddedilir", () => {
  const valid = signToken(42, "user");
  assert.equal(verifyAuthToken(valid).userId, 42);
  const retiredFallback = ["ozelguvenlik", "secret", "key"].join("-");
  const forged = jwt.sign({ userId: 1, role: "admin" }, retiredFallback);
  assert.throws(() => verifyAuthToken(forged));
});

test("production 500 cevabı iç hata ayrıntısını sızdırmaz", () => {
  let output: unknown;
  const res = {
    statusCode: 500,
    json(body: unknown) { output = body; return this; },
  };
  redactProductionErrors({} as never, res as never, () => {});
  res.json({ error: "relation users does not exist", code: "internal" });
  assert.deepEqual(output, { error: "Internal server error", code: "internal" });
});

test("production WhatsApp yapılandırılmış hata mesajı korunur", () => {
  let output: unknown;
  const res = {
    statusCode: 503,
    json(body: unknown) { output = body; return this; },
  };
  redactProductionErrors({} as never, res as never, () => {});
  res.json({
    success: false,
    code: "CACHE_PROFILE_CORRUPTED",
    message: "WhatsApp oturum önbelleği bozuldu ve yeniden hazırlanıyor.",
    error: "WhatsApp oturum önbelleği bozuldu ve yeniden hazırlanıyor.",
  });
  assert.equal((output as { code: string }).code, "CACHE_PROFILE_CORRUPTED");
  assert.match((output as { message: string }).message, /önbelleği bozuldu/);
});
