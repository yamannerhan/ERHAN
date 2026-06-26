import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable, ipBansTable, deviceBansTable } from "@workspace/db";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { logger } from "../lib/logger";

const JWT_SECRET = process.env.SESSION_SECRET ?? "ozelguvenlik-secret-key";

export interface JwtPayload {
  userId: number;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        role: string;
        avatarUrl: string | null;
        bio: string | null;
        nameColor: string | null;
        nameAnimated: boolean;
        isVip: boolean;
        vipUntil: Date | null;
        isBanned: boolean;
        banReason: string | null;
        banExpiresAt: Date | null;
        mutedUntil: Date | null;
        createdAt: Date;
      };
    }
  }
}

export function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "30d" });
}

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || req.ip
    || "";
  return raw.replace(/^::ffff:/, "");
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Giriş yapmanız gerekiyor" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user) {
      res.status(401).json({ error: "Kullanıcı bulunamadı" });
      return;
    }

    // Account ban check
    if (user.isBanned) {
      const now = new Date();
      if (!user.banExpiresAt || user.banExpiresAt > now) {
        res.status(403).json({ error: "Hesabınız yasaklandı", banReason: user.banReason, type: "account_ban" });
        return;
      }
      // Expired ban — auto-lift
      await db.update(usersTable).set({ isBanned: false, banReason: null, banExpiresAt: null }).where(eq(usersTable.id, user.id));
    }

    const now = new Date();
    const ip = extractIp(req);
    const deviceId = req.headers["x-device-id"] as string | undefined;

    // IP ban check
    if (ip) {
      const [ipBan] = await db.select({ id: ipBansTable.id })
        .from(ipBansTable)
        .where(and(eq(ipBansTable.ip, ip), or(isNull(ipBansTable.bannedUntil), gt(ipBansTable.bannedUntil, now))))
        .limit(1);
      if (ipBan) {
        res.status(403).json({ error: "Bu IP adresi yasaklanmıştır", type: "ip_ban" });
        return;
      }
    }

    // Device ban check
    if (deviceId) {
      const [deviceBan] = await db.select({ id: deviceBansTable.id })
        .from(deviceBansTable)
        .where(and(eq(deviceBansTable.deviceId, deviceId), or(isNull(deviceBansTable.bannedUntil), gt(deviceBansTable.bannedUntil, now))))
        .limit(1);
      if (deviceBan) {
        res.status(403).json({ error: "Bu cihaz yasaklanmıştır", type: "device_ban" });
        return;
      }
    }

    // Fire-and-forget: update last known IP and device ID
    setImmediate(() => {
      const updates: Record<string, unknown> = {};
      if (ip && user.lastKnownIp !== ip) updates["lastKnownIp"] = ip;
      if (deviceId && user.lastDeviceId !== deviceId) updates["lastDeviceId"] = deviceId;
      if (Object.keys(updates).length > 0) {
        db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).catch(() => {});
      }
    });

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      nameColor: user.nameColor,
      nameAnimated: user.nameAnimated,
      isVip: user.isVip && (!user.vipUntil || user.vipUntil > new Date()),
      vipUntil: user.vipUntil,
      isBanned: user.isBanned,
      banReason: user.banReason,
      banExpiresAt: user.banExpiresAt,
      mutedUntil: user.mutedUntil,
      createdAt: user.createdAt,
    };
    next();
  } catch {
    logger.warn("Invalid JWT token");
    res.status(401).json({ error: "Geçersiz token" });
  }
}

export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (user && !user.isBanned) {
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        nameColor: user.nameColor,
        nameAnimated: user.nameAnimated,
        isVip: user.isVip && (!user.vipUntil || user.vipUntil > new Date()),
        vipUntil: user.vipUntil,
        isBanned: user.isBanned,
        banReason: user.banReason,
        banExpiresAt: user.banExpiresAt,
        mutedUntil: user.mutedUntil,
        createdAt: user.createdAt,
      };
    }
  } catch {
    // ignore invalid token
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin yetkisi gerekiyor" });
    return;
  }
  next();
}

export function requireAdminOrModerator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !["admin", "moderator"].includes(req.user.role)) {
    res.status(403).json({ error: "Admin veya moderatör yetkisi gerekiyor" });
    return;
  }
  next();
}
