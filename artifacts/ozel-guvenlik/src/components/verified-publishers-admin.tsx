import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ShieldOff, PauseCircle, Search, RefreshCw, History } from "lucide-react";

type Publisher = {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  role: string;
  accountType?: string;
  isSystemAccount?: boolean;
  isVerifiedPublisher: boolean;
  verifiedAt: string | null;
  verificationType: string | null;
  verificationNote: string | null;
  verificationStatus: string;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export function VerifiedPublishersAdminSection({
  apiCall,
  toast,
  canApprove,
}: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<unknown>;
  toast: ToastFn;
  canApprove: boolean;
}) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [vType, setVType] = useState("company");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<number | null>(null);
  const [history, setHistory] = useState<Array<{
    id: number;
    status: string;
    verificationType?: string | null;
    note?: string | null;
    createdAt: string;
  }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status !== "all") q.set("status", status);
      if (search.trim()) q.set("search", search.trim());
      const data = await apiCall(`/admin/verified-publishers?${q.toString()}`, "GET") as {
        publishers: Publisher[];
      };
      setItems(data.publishers || []);
    } catch {
      toast({ title: "Liste yüklenemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [status, search, toast, apiCall]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: number, path: string, body?: Record<string, unknown>) => {
    if (!canApprove && (path === "verify-publisher" || path === "remove-verification" || path === "suspend-verification")) {
      toast({ title: "Onay yalnızca admin", variant: "destructive" });
      return;
    }
    try {
      await apiCall(`/admin/users/${id}/${path}`, "PATCH", body ?? {});
      toast({ title: "Güncellendi" });
      setSelectedId(null);
      setNote("");
      setConfirmed(false);
      void load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "İşlem başarısız";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const toggleHistory = async (id: number) => {
    if (historyOpenId === id) {
      setHistoryOpenId(null);
      return;
    }
    try {
      const data = await apiCall(`/admin/verified-publishers/${id}/history`, "GET") as {
        history?: typeof history;
      };
      setHistory(data.history ?? []);
      setHistoryOpenId(id);
    } catch {
      toast({ title: "İşlem geçmişi yüklenemedi", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md bg-black/40 border border-white/15 text-xs px-2 py-1.5"
        >
          <option value="all">Tümü</option>
          <option value="verified">Doğrulanmış</option>
          <option value="pending">Bekleyen</option>
          <option value="rejected">Reddedilen</option>
          <option value="suspended">Askıda</option>
          <option value="unverified">Doğrulanmamış</option>
        </select>
        <div className="flex items-center gap-1 flex-1 min-w-[140px]">
          <Search className="w-3.5 h-3.5 opacity-50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı ara…"
            className="flex-1 rounded-md bg-black/40 border border-white/15 text-xs px-2 py-1.5"
          />
        </div>
        <button type="button" onClick={() => void load()} className="p-1.5 rounded-md border border-white/15">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!canApprove && (
        <p className="text-[11px] text-amber-300/90">
          Moderatör: bekleyenleri görebilir ve not ekleyebilir; onay yalnızca admin.
        </p>
      )}

      <div className="space-y-2 max-h-[520px] overflow-y-auto">
        {items.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground py-4 text-center">Kayıt yok</p>
        )}
        {items.map((u) => (
          <div key={u.id} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">
                  @{u.username}
                  {u.displayName ? ` · ${u.displayName}` : ""}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10">{u.verificationStatus}</span>
                  {u.isVerifiedPublisher && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">verified</span>
                  )}
                  {u.verificationType && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200">{u.verificationType}</span>
                  )}
                </div>
                {u.verificationNote && (
                  <p className="text-[10px] mt-1 text-white/70 break-words">{u.verificationNote}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {canApprove && !u.isVerifiedPublisher && !u.isSystemAccount && u.accountType !== "bot" && (
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded bg-emerald-600/80 text-white flex items-center gap-1"
                    onClick={() => setSelectedId(u.id)}
                  >
                    <BadgeCheck className="w-3 h-3" /> Doğrula
                  </button>
                )}
                {canApprove && u.isVerifiedPublisher && (
                  <>
                    <button
                      type="button"
                      className="text-[10px] px-2 py-1 rounded bg-amber-600/70 text-white flex items-center gap-1"
                      onClick={() => {
                        const reason = prompt("Askıya alma nedeni:");
                        if (reason?.trim()) void act(u.id, "suspend-verification", { note: reason.trim() });
                      }}
                    >
                      <PauseCircle className="w-3 h-3" /> Askıya Al
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-2 py-1 rounded bg-red-600/70 text-white flex items-center gap-1"
                      onClick={() => {
                        const reason = prompt("Doğrulamayı kaldırma nedeni:");
                        if (reason?.trim()) void act(u.id, "remove-verification", {
                          note: reason.trim(),
                          stripActiveListingBadges: true,
                        });
                      }}
                    >
                      <ShieldOff className="w-3 h-3" /> Kaldır
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded border border-white/20"
                  onClick={() => {
                    const n = note || prompt("Not:") || "";
                    if (!n.trim()) return;
                    void act(u.id, "verification-note", { note: n, markPending: true });
                  }}
                >
                  Not / Beklemeye al
                </button>
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded border border-white/20 flex items-center gap-1"
                  onClick={() => void toggleHistory(u.id)}
                >
                  <History className="h-3 w-3" /> Geçmiş
                </button>
              </div>
            </div>
            {selectedId === u.id && canApprove && (
              <div className="flex flex-wrap gap-2 items-end pt-1 border-t border-white/10">
                <label className="text-[10px] space-y-1">
                  Tip
                  <select value={vType} onChange={(e) => setVType(e.target.value)} className="block rounded bg-black/50 border border-white/15 text-xs px-2 py-1">
                    <option value="individual">Bireysel</option>
                    <option value="company">Firma</option>
                    <option value="authorized_representative">Yetkili temsilci</option>
                  </select>
                </label>
                <label className="text-[10px] flex-1 min-w-[120px] space-y-1">
                  Not
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="İncelenen bilgiler ve doğrulama nedeni"
                    className="block w-full rounded bg-black/50 border border-white/15 text-xs px-2 py-1"
                  />
                </label>
                <label className="flex basis-full items-start gap-2 text-[10px] text-white/80">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-0.5"
                  />
                  Bu hesabın kimlik veya firma bilgilerinin incelendiğini ve doğrudan ilan yayınlama yetkisi verileceğini onaylıyorum.
                </label>
                <button
                  type="button"
                  disabled={!note.trim() || !confirmed}
                  className="text-[10px] px-3 py-1.5 rounded bg-emerald-500 text-black font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void act(u.id, "verify-publisher", {
                    verificationType: vType,
                    note: note.trim(),
                    confirmed,
                    syncCompanyProfile: true,
                  })}
                >
                  Onayla
                </button>
              </div>
            )}
            {historyOpenId === u.id && (
              <div className="space-y-1 border-t border-white/10 pt-2">
                {history.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">İşlem geçmişi bulunamadı.</p>
                ) : history.map((entry) => (
                  <div key={entry.id} className="rounded bg-white/5 px-2 py-1 text-[10px]">
                    <span className="font-semibold">{entry.status}</span>
                    {entry.verificationType ? ` · ${entry.verificationType}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                    <span className="ml-1 text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("tr-TR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
