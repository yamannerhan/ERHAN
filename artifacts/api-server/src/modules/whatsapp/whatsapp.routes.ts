import { Router } from "express";
import crypto from "node:crypto";
import { authMiddleware, requireAdmin } from "../../middlewares/auth";
import { logger } from "../../lib/logger";
import { WhatsAppModuleError } from "./whatsapp.client";
import { WhatsAppManager, WhatsAppStartError } from "./whatsapp.manager";
import {
  addWhatsAppGroupSource,
  disableWhatsAppSource,
  getDiscoveryDiagnostics,
  listWhatsAppGroups,
  listWhatsAppSourcesForAdmin,
  resetAllWhatsAppSources,
  resetWhatsAppSource,
  saveSelectedGroups,
} from "./whatsapp.group.service";
import { kickDeepScan, triggerScanNow } from "./whatsapp.scheduler";
import { parseAddSource, parseSaveSources, parseStartWhatsApp } from "./whatsapp.schemas";

const router = Router();

function mapError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof WhatsAppModuleError || error instanceof WhatsAppStartError) {
    return { status: error.statusCode, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

router.get("/admin/whatsapp/status", authMiddleware, requireAdmin, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json(WhatsAppManager.getStatus());
});

router.get("/whatsapp/session/status", authMiddleware, requireAdmin, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(WhatsAppManager.getStatus());
});

router.post("/admin/whatsapp/reload-chats", authMiddleware, requireAdmin, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!WhatsAppManager.getActiveClient()) {
      res.status(503).json({ success: false, error: "WhatsApp client yok", code: "CLIENT_NOT_AVAILABLE" });
      return;
    }
    if (!WhatsAppManager.isConnected()) {
      res.status(503).json({ success: false, error: "WhatsApp bağlı değil", code: "NOT_CONNECTED" });
      return;
    }
    await WhatsAppManager.refreshGroups();
    const status = WhatsAppManager.getStatus();
    res.json({
      success: true,
      message: "Grup listesi yenilendi.",
      ...status,
    });
  } catch (error) {
    const m = mapError(error);
    res.status(m.status).json({ success: false, error: m.message, code: m.code });
  }
});

router.post("/admin/whatsapp/start", authMiddleware, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const requestId = crypto.randomUUID();
  try {
    const parsed = parseStartWhatsApp(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.message, code: "VALIDATION" });
      return;
    }
    const phoneNumber = parsed.data.phoneNumber?.trim();
    const mode = parsed.data.mode ?? (phoneNumber ? "pairing_code" : "qr");

    logger.info({ requestId, mode, endpoint: "/admin/whatsapp/start" }, "wa: start request");

    const st = mode === "pairing_code"
      ? await WhatsAppManager.connectPairing(phoneNumber || "")
      : await WhatsAppManager.connectQr();

    const pairingCode = st.pairingCode;
    const qr = mode === "qr" ? st.qr : null;

    res.status(200).json({
      success: true,
      mode,
      status: st.status,
      message: mode === "pairing_code"
        ? (pairingCode
          ? "Onay kodu hazır. WhatsApp uygulamanızdan girin."
          : "WhatsApp bağlantısı hazırlanıyor.")
        : (qr
          ? "QR kodu hazır. WhatsApp → Bağlı Cihazlar → Cihaz bağla."
          : st.ready || st.connected
            ? "WhatsApp zaten bağlı."
            : "WhatsApp bağlantısı hazırlanıyor."),
      phase: st.status.toLowerCase(),
      pairingCode,
      expiresInSeconds: pairingCode ? 180 : null,
      qr,
      sessionId: st.sessionId,
      clientInstanceId: st.clientInstanceId,
      ready: st.ready,
      chatCount: st.chatCount,
      groupCount: st.groupCount,
    });
  } catch (error) {
    const m = mapError(error);
    logger.error({ err: error, requestId, code: m.code }, "wa: start failed");
    res.status(m.status).json({ success: false, error: m.message, code: m.code });
  }
});

router.post("/admin/whatsapp/stop", authMiddleware, requireAdmin, async (_req, res) => {
  await WhatsAppManager.disconnect();
  res.json({ success: true, message: "WhatsApp client durduruldu." });
});

router.post("/admin/whatsapp/reset-session", authMiddleware, requireAdmin, async (_req, res) => {
  await WhatsAppManager.resetSession();
  res.json({ success: true, message: "WhatsApp oturumu sıfırlandı. Yeniden bağlanın." });
});

router.get("/admin/whatsapp/groups", authMiddleware, requireAdmin, async (_req, res) => {
  const activeClient = WhatsAppManager.getActiveClient();
  const st = WhatsAppManager.getStatus();
  if (!activeClient) {
    res.status(503).json({
      error: "WhatsApp client yok",
      code: "CLIENT_NOT_AVAILABLE",
      connectionStatus: st.connectionStatus,
      groupDiscoveryStatus: st.groupDiscoveryStatus,
      clientInstanceId: st.clientInstanceId,
    });
    return;
  }
  if (!WhatsAppManager.isConnected()) {
    res.status(503).json({
      error: "WhatsApp bağlı değil",
      code: "NOT_CONNECTED",
      connectionStatus: st.connectionStatus,
      groupDiscoveryStatus: st.groupDiscoveryStatus,
      clientInstanceId: st.clientInstanceId,
    });
    return;
  }

  // READY şartı yok — CONNECTED iken keşif başlar / cache döner
  const groups = await listWhatsAppGroups();
  const diagnostics = await getDiscoveryDiagnostics();
  const status = WhatsAppManager.getStatus();
  res.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind ?? (g.isChannel ? "channel" : "group"),
      isGroup: g.isGroup,
      isChannel: g.isChannel,
      lastMessageAt: g.lastMessageAt,
    })),
    diagnostics: {
      ...diagnostics,
      ready: status.groupDiscoveryStatus === "READY",
      chatCount: status.chatCount,
      groupCount: status.groupCount,
      channelCount: status.channelCount,
      state: status.connectionStatus,
      clientInstanceId: status.clientInstanceId,
      groupDiscoveryStatus: status.groupDiscoveryStatus,
      errors: diagnostics.error ? [diagnostics.error] : [],
      steps: diagnostics.steps,
    },
    connectionStatus: status.connectionStatus,
    groupDiscoveryStatus: status.groupDiscoveryStatus,
    clientInstanceId: status.clientInstanceId,
  });
});

router.post("/admin/whatsapp/add-source", authMiddleware, requireAdmin, async (req, res) => {
  const parsed = parseAddSource(req.body ?? {});
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.message });
    return;
  }
  try {
    const { source, legacySourceId, created } = await addWhatsAppGroupSource(parsed.data);
    const kind = parsed.data.groupId.includes("@newsletter") ? "kanal" : "grup";
    if (WhatsAppManager.isReady()) kickDeepScan();
    res.json({
      success: true,
      source: { id: legacySourceId, name: source.chatName, url: source.chatId },
      message: created
        ? `${kind} kaydedildi. 15 günlük ilk tarama kuyruğa alındı.`
        : "Bu grup zaten kayıtlı. Tarama devam ediyor.",
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/whatsapp/sources/save", authMiddleware, requireAdmin, async (req, res) => {
  const parsed = parseSaveSources(req.body ?? {});
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.message });
    return;
  }
  try {
    const results = await saveSelectedGroups(parsed.data.groups);
    if (WhatsAppManager.isReady()) kickDeepScan();
    res.json({
      success: true,
      saved: results.length,
      message: `${results.length} grup kaydedildi. İlk tarama kuyruğa alındı.`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete("/admin/whatsapp/sources/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz ID" });
    return;
  }
  try {
    const { name } = await disableWhatsAppSource(id);
    res.json({ success: true, message: `«${name}» listeden çıkarıldı.` });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "Kaynak bulunamadı" });
  }
});

router.get("/admin/whatsapp/sources", authMiddleware, requireAdmin, async (_req, res) => {
  res.json(await listWhatsAppSourcesForAdmin());
});

router.post("/admin/whatsapp/scan-now", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const result = await triggerScanNow();
    if (!result.ready) {
      res.status(503).json({ error: "WhatsApp bağlı değil. Önce QR veya onay kodu ile bağlanın." });
      return;
    }
    const msg = result.mode === "initial"
      ? `${result.pendingGroups} grupta 15 gün tarama devam ediyor`
        + (result.currentGroup ? ` — şimdi: ${result.currentGroup}` : "")
        + ". Bitince her 10 dakikada yeni mesajlar taranır."
      : `${result.pendingGroups} grup kaldığı yerden taranıyor (sadece yeni mesajlar).`;
    res.json({
      success: true,
      scanned: result.scanned,
      queued: result.queued,
      mode: result.mode,
      pendingGroups: result.pendingGroups,
      currentGroup: result.currentGroup,
      results: result.results,
      message: msg,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/whatsapp/reset", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    if (!WhatsAppManager.isReady()) {
      res.status(503).json({ error: "WhatsApp bağlı değil. Önce bağlanın." });
      return;
    }
    const result = await resetAllWhatsAppSources();
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      pendingGroups: result.pendingGroups,
      message: `${result.deletedListings} WhatsApp ilanı silindi. ${result.pendingGroups} grup 15 günden temiz taranacak.`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/whatsapp/sources/:id/reset", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Geçersiz id" }); return; }
    const result = await resetWhatsAppSource(id);
    res.json({
      success: true,
      deletedListings: result.deletedListings,
      message: `${result.deletedListings} ilan silindi. Bu grup 15 günden yeniden taranıyor.`,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
