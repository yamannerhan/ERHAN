import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_NOTIF_PREFS,
  NOTIF_PREF_ITEMS,
  fetchNotifPrefs,
  saveNotifPrefsApi,
  type NotifPrefs,
} from "@/lib/notif-prefs";

export function NotifPrefsPanel({ compact = false, onSaved }: { compact?: boolean; onSaved?: () => void }) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotifPrefs>({ ...DEFAULT_NOTIF_PREFS });
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchNotifPrefs()
      .then((p) => setPrefs(p))
      .finally(() => setReady(true));
  }, []);

  const save = async () => {
    setLoading(true);
    try {
      const saved = await saveNotifPrefsApi(prefs);
      setPrefs(saved);
      toast({ title: "Bildirim tercihleri kaydedildi" });
      onSaved?.();
    } catch {
      toast({ title: "Kaydedilemedi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {!compact && (
        <p className="text-[11px] text-white/45 mb-1">
          İstemediğiniz bildirimleri kapatın. Uygulama açıkken push gitmesin seçeneği rahatsız etmez.
        </p>
      )}
      {NOTIF_PREF_ITEMS.map((item) => (
        <label key={item.key} className="flex items-center justify-between gap-2 py-1.5 cursor-pointer">
          <span className="min-w-0">
            <span className={`block ${compact ? "text-[12px]" : "text-sm"}`}>{item.label}</span>
            <span className="text-[10px] text-white/40 block">{item.desc}</span>
          </span>
          <input
            type="checkbox"
            checked={prefs[item.key]}
            onChange={(e) => setPrefs((p) => ({ ...p, [item.key]: e.target.checked }))}
            className="w-4 h-4 accent-amber-400 shrink-0"
          />
        </label>
      ))}
      <Button
        onClick={() => void save()}
        disabled={loading}
        className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold mt-2 h-9 text-sm"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Kaydet
      </Button>
    </div>
  );
}
