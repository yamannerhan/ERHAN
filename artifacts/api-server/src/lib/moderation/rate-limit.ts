import type { Request, Response, NextFunction } from "express";

/** Lightweight in-memory rate limit for mutating moderator routes */
const hits = new Map<string, { count: number; resetAt: number }>();

export function moderationRateLimit(opts?: { windowMs?: number; max?: number }) {
  const windowMs = opts?.windowMs ?? 60_000;
  const max = opts?.max ?? 40;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const userId = req.user?.id ?? 0;
    const key = `${userId}:${req.method}:${req.path.split("/").slice(0, 4).join("/")}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: "Çok fazla işlem. Lütfen biraz bekleyin." });
      return;
    }
    next();
  };
}

/** Periodic cleanup to avoid unbounded growth */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (v.resetAt <= now) hits.delete(k);
  }
}, 120_000).unref?.();
