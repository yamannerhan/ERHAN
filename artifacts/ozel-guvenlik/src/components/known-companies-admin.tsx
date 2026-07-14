import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Loader2, Plus, RefreshCw, Trash2, Upload, Image as ImageIcon } from "lucide-react";

type KnownCompany = {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  aliases: string[];
  isActive: boolean;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export function KnownCompaniesAdminSection({
  apiCall,
  toast,
  getToken,
}: {
  apiCall: (path: string, method: string, body?: unknown) => Promise<any>;
  toast: ToastFn;
  getToken: () => string | null;
}) {
  const [items, setItems] = useState<KnownCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [defaultLogoUrl, setDefaultLogoUrl] = useState("/brand-logo.png");
  const [defaultLogoUploading, setDefaultLogoUploading] = useState(false);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const defaultLogoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, defaultLogo] = await Promise.all([
        apiCall("/admin/known-companies", "GET"),
        apiCall("/admin/default-company-logo", "GET"),
      ]);
      setItems(Array.isArray(data) ? data : []);
      setDefaultLogoUrl(defaultLogo?.logoUrl || "/brand-logo.png");
    } catch (e: any) {
      toast({ title: "Firmalar yüklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiCall, toast]);

  useEffect(() => { void load(); }, [load]);

  const uploadDefaultLogo = async (file: File | null) => {
    if (!file) return;
    setDefaultLogoUploading(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/admin/default-company-logo", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Yükleme başarısız");
      setDefaultLogoUrl((data as { logoUrl?: string }).logoUrl || "/api/default-company-logo");
      toast({
        title: "Varsayılan firma logosu güncellendi",
        description: `${(data as { appliedListings?: number }).appliedListings ?? 0} firmasız ilan anında güncellendi`,
      });
    } catch (e: any) {
      toast({ title: "Varsayılan logo yüklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setDefaultLogoUploading(false);
      if (defaultLogoRef.current) defaultLogoRef.current.value = "";
    }
  };

  const seed = async () => {
    setSaving(true);
    try {
      const r = await apiCall("/admin/known-companies/seed", "POST");
      toast({ title: "Seed tamam", description: `${r?.seeded ?? 0} logo işlendi / güncellendi` });
      await load();
    } catch (e: any) {
      toast({ title: "Seed başarısız", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    if (!name.trim()) {
      toast({ title: "Şirket adı gerekli", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiCall("/admin/known-companies", "POST", {
        name: name.trim(),
        aliases: aliases.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      });
      setName("");
      setAliases("");
      toast({ title: "Şirket eklendi" });
      await load();
    } catch (e: any) {
      toast({ title: "Eklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (id: number, file: File | null) => {
    if (!file) return;
    setUploadingId(id);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/admin/known-companies/${id}/logo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Yükleme başarısız");
      toast({
        title: "Logo yüklendi (beyazlar kırpıldı)",
        description: `${(data as { appliedListings?: number }).appliedListings ?? 0} ilana uygulandı`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Logo yüklenemedi", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const reapply = async (id: number) => {
    try {
      const r = await apiCall(`/admin/known-companies/${id}/apply-listings`, "POST");
      toast({ title: "İlanlara uygulandı", description: `${r?.applied ?? 0} ilan güncellendi` });
    } catch (e: any) {
      toast({ title: "Uygulanamadı", description: e?.message, variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Bu şirket katalogdan silinsin mi?")) return;
    try {
      await apiCall(`/admin/known-companies/${id}`, "DELETE");
      toast({ title: "Silindi" });
      await load();
    } catch (e: any) {
      toast({ title: "Silinemedi", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Building2 className="h-5 w-5" /> Hazır Şirket Logoları</h2>
          <p className="text-sm text-muted-foreground">
            Botların çektiği ilanlarda şirket adı (İ/I, ü/u, kısaltma) eşleşince logo otomatik gelir.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Yenile
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void seed()} disabled={saving}>
            Seed Logoları Yükle
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 p-3 bg-amber-500/5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-white border border-amber-500/30 overflow-hidden shrink-0 flex items-center justify-center">
            <img src={defaultLogoUrl} alt="Varsayılan firma" className="w-full h-full object-contain box-border p-1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Firması belirtilmeyen ilanların logosu</div>
            <p className="text-xs text-muted-foreground">
              Değiştirildiğinde firma adı olmayan mevcut ve yeni ilanlarda anında kullanılır.
            </p>
          </div>
          <input
            ref={defaultLogoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void uploadDefaultLogo(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => defaultLogoRef.current?.click()}
            disabled={defaultLogoUploading}
          >
            {defaultLogoUploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Varsayılan logoyu değiştir
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-2 bg-card">
        <div className="text-sm font-semibold">Yeni şirket</div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Şirket adı (örn. Securitas)" />
        <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Kısaltmalar / alias (virgülle: glm, glm grup)" />
        <Button type="button" onClick={() => void create()} disabled={saving}>
          <Plus className="h-4 w-4 mr-1" /> Ekle
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">Henüz şirket yok. “Seed Logoları Yükle” ile 10 örneği ekleyin.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {c.logoUrl ? (
                    <img src={`${c.logoUrl}?t=${c.id}`} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.aliases?.join(", ")}</div>
                </div>
              </div>
              <input
                ref={(el) => { fileRefs.current[c.id] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void uploadLogo(c.id, e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingId === c.id}
                  onClick={() => fileRefs.current[c.id]?.click()}
                >
                  {uploadingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  <span className="ml-1">Logo</span>
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void reapply(c.id)}>
                  İlanlara uygula
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void remove(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
