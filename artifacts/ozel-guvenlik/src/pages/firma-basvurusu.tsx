import React, { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Redirect, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Building2, CheckCircle2, Loader2, Upload } from "lucide-react";

/**
 * Firma Başvurusu — logo + unvan gönder; moderasyon sonrası doğrulanmış görünür.
 */
export default function FirmaBasvurusuPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("auth_token");
    void fetch("/api/company-profiles/me", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.companyName) setCompanyName(d.companyName);
        if (d?.phone) setPhone(d.phone);
        if (d?.logoPath) setLogoPreview(d.logoPath);
      })
      .catch(() => undefined);
  }, [user]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[40vh] flex items-center justify-center text-slate-400 text-sm">Yükleniyor…</div>
      </Layout>
    );
  }
  if (!user) return <Redirect to="/giris" />;

  const submit = async () => {
    if (!companyName.trim()) {
      toast({ title: "Firma adı zorunlu", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch("/api/company-profiles/me", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          companyName: companyName.trim(),
          phone: phone.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Kayıt başarısız");

      if (pendingFile) {
        const fd = new FormData();
        fd.append("logo", pendingFile);
        const up = await fetch("/api/company-profiles/me/logo", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        if (!up.ok) {
          const err = await up.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Logo yüklenemedi");
        }
      }

      setDone(true);
      toast({
        title: "Başvuru alındı",
        description: "Moderasyon sonrası ilanlarınızda doğrulanmış firma olarak görüneceksiniz.",
      });
    } catch (e: unknown) {
      toast({
        title: "Başvuru başarısız",
        description: e instanceof Error ? e.message : "Hata",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-extrabold flex items-center gap-2 mb-2">
          <Building2 className="h-7 w-7 text-amber-500" />
          Firma Başvurusu Yap
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Firma adınızı ve logonuzu gönderin. Onaylanınca ilanlarınızda <strong>doğrulanmış firma</strong> rozeti ve logonuz görünür.
        </p>

        {done ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <CheckCircle2 className="h-5 w-5" /> Başvurunuz alındı
            </div>
            <p className="text-sm text-muted-foreground">
              Moderasyon ekibi inceledikten sonra doğrulama aktif olur. İlan oluştururken kayıtlı bilgileriniz otomatik gelir.
            </p>
            <Link href="/ilan-ekle" className="text-sm font-semibold text-amber-400 underline">
              İlan vermeye git →
            </Link>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border p-4 bg-card">
            <div>
              <label className="text-sm font-medium">Firma Adı</label>
              <input
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Örn. Genser Güvenlik"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Telefon</label>
              <input
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xx xxx xx xx"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Logo</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setPendingFile(f);
                  setLogoPreview(URL.createObjectURL(f));
                }}
              />
              <button
                type="button"
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm hover:bg-muted/40"
                onClick={() => fileRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Logo yükle
                  </>
                )}
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-black disabled:opacity-60"
            >
              {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Başvuruyu Gönder"}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
