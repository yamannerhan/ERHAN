import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/announcements", async (_req, res): Promise<void> => {
  const announcements = await db.select().from(announcementsTable)
    .where(eq(announcementsTable.isActive, true))
    .orderBy(desc(announcementsTable.createdAt));

  res.json(announcements.map(a => ({
    id: a.id,
    content: a.content,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/announcements", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: "İçerik zorunludur" });
    return;
  }

  const [announcement] = await db.insert(announcementsTable).values({ content: content.trim(), isActive: true }).returning();
  res.status(201).json({
    id: announcement.id,
    content: announcement.content,
    isActive: announcement.isActive,
    createdAt: announcement.createdAt.toISOString(),
  });
});

router.delete("/announcements/:id", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Geçersiz ID" }); return; }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.sendStatus(204);
});

export default router;
