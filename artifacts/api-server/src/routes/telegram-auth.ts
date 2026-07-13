import { Router } from "express";
import { authMiddleware, requireAdmin } from "../middlewares/auth";
import {
  startAuth, verifyCode, verifyPassword, logout,
  getAuthState, getCurrentPhone, isClientConnected,
  getBotInfo, isBotTokenSet, ensureTelegramConnected, hasTelegramSessionStored,
} from "../services/telegram-client";

const router = Router();

router.get("/admin/telegram/status", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const connected = await ensureTelegramConnected(2);
  const state = getAuthState();
  const phone = getCurrentPhone();
  const botInfo = isBotTokenSet() ? await getBotInfo() : null;
  const hasSession = await hasTelegramSessionStored();
  res.json({ state, phone, connected, hasSession, bot: botInfo });
});

router.post("/admin/telegram/reconnect", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  const connected = await ensureTelegramConnected(5);
  if (connected) {
    res.json({ ok: true, connected: true, message: "Telegram oturumu yeniden bağlandı." });
    return;
  }
  res.status(400).json({
    ok: false,
    connected: false,
    error: "Oturum bulunamadı veya süresi dolmuş. Telefon numarası ile yeniden giriş yapın.",
  });
});

router.post("/admin/telegram/auth/start", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone?.trim()) { res.status(400).json({ error: "Telefon numarası gerekli" }); return; }
  try {
    await startAuth(phone.trim());
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = (e as { errorMessage?: string; message?: string }).errorMessage ?? (e as Error).message ?? String(e);
    res.status(400).json({ error: msg });
  }
});

router.post("/admin/telegram/auth/verify", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) { res.status(400).json({ error: "Kod gerekli" }); return; }
  try {
    const result = await verifyCode(code.trim());
    res.json(result);
  } catch (e: unknown) {
    const msg = (e as { errorMessage?: string; message?: string }).errorMessage ?? (e as Error).message ?? String(e);
    res.status(400).json({ error: msg });
  }
});

router.post("/admin/telegram/auth/password", authMiddleware, requireAdmin, async (req, res): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (!password) { res.status(400).json({ error: "Şifre gerekli" }); return; }
  try {
    await verifyPassword(password);
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = (e as { errorMessage?: string; message?: string }).errorMessage ?? (e as Error).message ?? String(e);
    res.status(400).json({ error: msg });
  }
});

router.post("/admin/telegram/auth/logout", authMiddleware, requireAdmin, async (_req, res): Promise<void> => {
  await logout();
  res.json({ ok: true });
});

export default router;
