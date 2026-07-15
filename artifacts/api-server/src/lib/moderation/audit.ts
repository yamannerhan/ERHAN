import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import type { Request } from "express";

function extractIp(req?: Request): string | null {
  if (!req) return null;
  const raw = req.ip || "";
  return raw.replace(/^::ffff:/, "") || null;
}

export async function writeAuditLog(opts: {
  req?: Request;
  actorUserId?: number | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  previousData?: unknown;
  newData?: unknown;
  reason?: string | null;
  success?: boolean;
  requestId?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      actorUserId: opts.actorUserId ?? opts.req?.user?.id ?? null,
      actorRole: opts.actorRole ?? opts.req?.user?.role ?? null,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      previousData: opts.previousData ?? null,
      newData: opts.newData ?? null,
      reason: opts.reason ?? null,
      ip: extractIp(opts.req),
      userAgent: opts.req?.headers["user-agent"]?.slice(0, 500) ?? null,
      requestId: opts.requestId ?? null,
      success: opts.success !== false,
    });
  } catch {
    // audit failure must not break the main flow
  }
}
