import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

router.get("/notifications", authMiddleware, async (req, res): Promise<void> => {
  const notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications.map(n => ({
    id: n.id,
    type: n.type,
    message: n.message,
    isRead: n.isRead,
    linkUrl: n.linkUrl,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.post("/notifications/read-all", authMiddleware, async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, req.user!.id));
  res.json({ success: true });
});

router.delete("/notifications", authMiddleware, async (req, res): Promise<void> => {
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, req.user!.id));
  res.json({ success: true });
});

router.get("/notifications/unread-count", authMiddleware, async (req, res): Promise<void> => {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id));
  res.json({ count: result?.count ?? 0 });
});

export default router;
