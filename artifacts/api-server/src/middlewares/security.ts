import type { NextFunction, Request, Response } from "express";

const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_ORIGINS = isProduction
  ? ["https://ozelguvenlik.online", "https://www.ozelguvenlik.online"]
  : ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"];

export const allowedOrigins = new Set(
  (process.env["APP_ORIGINS"] ?? DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function corsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  if (isAllowedOrigin(origin)) callback(null, true);
  else callback(null, false);
}

export function verifyMutationOrigin(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.header("origin");
  const fetchSite = req.header("sec-fetch-site");
  if ((origin && !isAllowedOrigin(origin)) || fetchSite === "cross-site") {
    res.status(403).json({ error: "İstek kaynağı doğrulanamadı" });
    return;
  }
  next();
}

type RateLimitOptions = {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  message?: string;
};

type Bucket = { count: number; resetAt: number };
const stores = new Set<Map<string, Bucket>>();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const store of stores) {
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(key);
    }
  }
}, 5 * 60_000);
cleanupTimer.unref();

export function createRateLimit(options: RateLimitOptions) {
  const store = new Map<string, Bucket>();
  stores.add(store);
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = options.key?.(req) ?? req.ip ?? "unknown";
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      store.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: options.message ?? "Çok fazla istek. Lütfen daha sonra tekrar deneyin." });
      return;
    }
    next();
  };
}

export const loginRateLimit = createRateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip}:${String((req.body as { email?: unknown })?.email ?? "").trim().toLowerCase()}`,
  message: "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.",
});

export const registerRateLimit = createRateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  message: "Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.",
});

export const passwordRateLimit = createRateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  key: (req) => `${req.ip}:${req.user?.id ?? "anonymous"}`,
});

export const adminMutationRateLimit = createRateLimit({
  windowMs: 15 * 60_000,
  max: 180,
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  key: (req) => `${req.ip}:${req.user?.id ?? "anonymous"}`,
});

/** Route-level catch bloklarının production'da iç hata ayrıntısı sızdırmasını engeller. */
export function redactProductionErrors(_req: Request, res: Response, next: NextFunction): void {
  if (!isProduction) {
    next();
    return;
  }
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 500 && body && typeof body === "object" && "error" in body) {
      return originalJson({ ...(body as Record<string, unknown>), error: "Internal server error" });
    }
    return originalJson(body);
  }) as Response["json"];
  next();
}
