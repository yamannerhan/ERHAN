import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCreateListing } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Redirect, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sparkles, RefreshCw, Trash2, Wand2, Check, MapPin, Briefcase, Building2,
  CircleDollarSign, Phone, FileText, Send, Shield, Loader2,
} from "lucide-react";
import "@/components/add-listing-page.css";

const POSITIONS = [
  "Özel Güvenlik Görevlisi",
  "Silahlı Özel Güvenlik Görevlisi",
  "Silahsız Özel Güvenlik Görevlisi",
  "Site Güvenlik Görevlisi",
  "AVM Güvenlik Görevlisi",
  "Etkinlik Güvenlik Görevlisi",
] as const;

const WORK_TYPES = ["Tam Zamanlı", "PartTime", "Günlük"] as const;
const SHIFTS = ["8 Saat", "12 Saat", "Vardiyalı"] as const;
const GENDERS = ["Bay / Bayan", "Bay", "Bayan"] as const;
const ARMED_OPTIONS = ["Silahsız", "Silahlı"] as const;
const PERK_OPTIONS = ["Yemek", "Yol", "SGK", "Servis", "Prim"] as const;

const SAMPLE_TEXT =
  "Genser Güvenlik Sistemleri A.Ş. bünyesinde İstanbul Şişli'de görevlendirilmek üzere Özel Güvenlik Görevlisi aranmaktadır. Tam zamanlı, 8 saat vardiya. Silahsız, bay/bayan. Maaş: 41.178 TL. Yemek, yol, SGK, servis ve prim imkânı. İletişim: 0 (212) 555 12 34";

const listingSchema = z.object({
  title: z.string().min(5, "Pozisyon en az 5 karakter olmalıdır."),
  company: z.string().optional(),
  city: z.string().min(2, "Şehir zorunludur."),
  workType: z.string().min(1, "Çalışma şekli seçiniz."),
  salary: z.string().optional(),
  description: z.string().min(20, "Açıklama en az 20 karakter olmalıdır."),
  requirements: z.string().optional(),
  applyUrl: z.string().optional(),
  companyLogoUrl: z.string().optional(),
  cardTheme: z.string().optional(),
});

type ListingFormValues = z.infer<typeof listingSchema>;

type ExtractStatus = {
  position: boolean;
  city: boolean;
  salary: boolean;
  workType: boolean;
};

function detectShift(text: string): string {
  const t = text.toLocaleLowerCase("tr-TR");
  if (/12\s*saat|12\/24/.test(t)) return "12 Saat";
  if (/8\s*saat/.test(t)) return "8 Saat";
  if (/vardiya/.test(t)) return "Vardiyalı";
  return "8 Saat";
}

function detectArmed(text: string): string {
  const t = text.toLocaleLowerCase("tr-TR");
  if (/silahl[ıi]\s*ögg|silahl[ıi]/.test(t)) return "Silahlı";
  if (/silahs[ıi]z/.test(t)) return "Silahsız";
  return "Silahsız";
}

function detectGender(text: string): string {
  const t = text.toLocaleLowerCase("tr-TR");
  const male = /\bbay\b|\berkek\b/.test(t);
  const female = /\bbayan\b|\bkad[ıi]n\b/.test(t);
  if (male && female) return "Bay / Bayan";
  if (male) return "Bay";
  if (female) return "Bayan";
  return "Bay / Bayan";
}

function detectPerks(text: string, benefits?: string): string[] {
  const blob = `${text} ${benefits ?? ""}`.toLocaleLowerCase("tr-TR");
  return PERK_OPTIONS.filter(p => blob.includes(p.toLocaleLowerCase("tr-TR")));
}

function buildExtrasRequirements(shift: string, gender: string, armed: string, perks: string[], base?: string): string {
  const lines = [
    shift ? `Vardiya: ${shift}` : "",
    gender ? `Cinsiyet: ${gender}` : "",
    armed || "",
    perks.length ? `Yan Haklar: ${perks.join(", ")}` : "",
    base?.trim() || "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatPreviewSalary(raw?: string): { amount: string; period: string } {
  const s = (raw || "").trim();
  if (!s) return { amount: "—", period: "" };
  let period = "Aylık";
  if (/g[uü]nl[uü]k/i.test(s)) period = "Günlük";
  const amount = s.replace(/\b(ayl[iı]k|g[uü]nl[uü]k)\b/gi, "").replace(/\s+/g, " ").trim() || s;
  return { amount, period };
}

export default function AddListing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateListing();
  const { user, isLoading } = useAuth();
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [smartText, setSmartText] = useState("");
  const [smartLoading, setSmartLoading] = useState(false);
  const [extractStatus, setExtractStatus] = useState<ExtractStatus | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shift, setShift] = useState<string>("8 Saat");
  const [gender, setGender] = useState<string>("Bay / Bayan");
  const [armed, setArmed] = useState<string>("Silahsız");
  const [perks, setPerks] = useState<string[]>(["Yemek", "Yol", "SGK"]);
  const [companyProfile, setCompanyProfile] = useState<{
    companyName: string;
    logoPath: string | null;
    isVerified?: boolean;
  } | null | undefined>(undefined);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: POSITIONS[0],
      company: "",
      city: "",
      workType: "Tam Zamanlı",
      salary: "",
      description: "",
      requirements: "",
      applyUrl: "",
      companyLogoUrl: "",
      cardTheme: "auto",
    },
  });

  const watched = form.watch();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/giris");
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch("/api/company-profiles/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) {
          if (!cancelled) setCompanyProfile(null);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data?.companyName) {
          setCompanyProfile({
            companyName: data.companyName,
            logoPath: data.logoPath || null,
            isVerified: !!data.isVerified,
          });
          form.setValue("company", data.companyName);
          if (data.logoPath) {
            form.setValue("companyLogoUrl", data.logoPath);
            setImagePreview(data.logoPath);
          }
        } else {
          setCompanyProfile(null);
        }
      } catch {
        if (!cancelled) setCompanyProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user, form]);

  const handlePhotoUpload = async (file: File) => {
    const localPreview = URL.createObjectURL(file);
    setImagePreview(localPreview);
    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/listings/image-upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Yükleme başarısız");
      const data = (await res.json()) as { url: string };
      form.setValue("companyLogoUrl", data.url);
      setImagePreview(data.url);
    } catch {
      toast({ title: "Logo yüklenemedi", variant: "destructive" });
      setImagePreview("");
      form.setValue("companyLogoUrl", "");
    }
  };

  const parseSmartListing = async () => {
    if (!smartText.trim()) return;
    setSmartLoading(true);
    setExtractStatus(null);
    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const res = await fetch("/api/listings/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: smartText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ayıklama başarısız");

      const title = data.title || POSITIONS[0];
      const city = [data.city, data.district].filter(Boolean).join(" / ") || data.city || "";
      const workType = WORK_TYPES.includes(data.workType) ? data.workType : (
        /part\s*time|parttime/i.test(smartText) ? "PartTime"
          : /g[uü]nl[uü]k/i.test(smartText) ? "Günlük" : "Tam Zamanlı"
      );

      form.setValue("title", title);
      if (!companyProfile) form.setValue("company", data.company || "Belirtilmedi");
      form.setValue("city", city || "Türkiye");
      form.setValue("workType", workType);
      form.setValue("salary", data.salary || "");
      form.setValue("description", data.description || smartText);
      form.setValue("applyUrl", data.applyUrl || data.contactPhone ? `tel:${String(data.contactPhone).replace(/\D/g, "")}` : "");
      if (data.companyLogoUrl) {
        form.setValue("companyLogoUrl", data.companyLogoUrl);
        setImagePreview(data.companyLogoUrl);
      }

      setShift(detectShift(smartText));
      setGender(data.gender || detectGender(smartText));
      setArmed(detectArmed(smartText));
      setPerks(detectPerks(smartText, data.benefits));

      form.setValue("requirements", buildExtrasRequirements(
        detectShift(smartText),
        data.gender || detectGender(smartText),
        detectArmed(smartText),
        detectPerks(smartText, data.benefits),
        data.requirements,
      ));

      setExtractStatus({
        position: !!title && title.length > 3,
        city: !!city && city.length > 2,
        salary: !!data.salary,
        workType: !!workType,
      });

      toast({ title: "İlan bilgileri ayıklandı", description: "Alanları kontrol edip yayınlayabilirsiniz." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ayıklama başarısız";
      toast({ title: "Ayıklama başarısız", description: message, variant: "destructive" });
    } finally {
      setSmartLoading(false);
    }
  };

  const syncRequirements = (next: { shift?: string; gender?: string; armed?: string; perks?: string[] }) => {
    const s = next.shift ?? shift;
    const g = next.gender ?? gender;
    const a = next.armed ?? armed;
    const p = next.perks ?? perks;
    form.setValue("requirements", buildExtrasRequirements(s, g, a, p));
  };

  const onSubmit = async (values: ListingFormValues) => {
    setDupWarning(null);
    const requirements = buildExtrasRequirements(shift, gender, armed, perks, values.requirements);
    try {
      const payload: Record<string, unknown> = {
        ...values,
        company: values.company?.trim() || companyProfile?.companyName || "Belirtilmedi",
        salary: values.salary || null,
        requirements: requirements || null,
        applyUrl: values.applyUrl || null,
        companyLogoUrl: values.companyLogoUrl || companyProfile?.logoPath || null,
        cardTheme: null,
      };
      await createMutation.mutateAsync({ data: payload as never });
      toast({ title: "İlan başarıyla yayınlandı", description: "İlan 1 ay boyunca yayında kalacaktır." });
      setLocation("/ilanlar");
    } catch (error: unknown) {
      const err = error as { data?: { error?: string }; message?: string; status?: number };
      const serverMsg = err?.data?.error || err?.message || "İlan eklenirken bir hata oluştu.";
      if (err?.status === 409) setDupWarning(serverMsg);
      else toast({ title: "Hata", description: serverMsg, variant: "destructive" });
    }
  };

  const previewTags = useMemo(() => {
    const tags: string[] = [];
    if (watched.workType) tags.push(watched.workType);
    if (shift) tags.push(shift);
    if (armed) tags.push(armed);
    if (gender) tags.push(gender);
    return tags.slice(0, 4);
  }, [watched.workType, shift, armed, gender]);

  const previewSalary = formatPreviewSalary(watched.salary);
  const previewLogo = imagePreview || companyProfile?.logoPath || watched.companyLogoUrl;
  const previewCompany = companyProfile?.companyName || watched.company || "Firma";

  if (isLoading) {
    return (
      <Layout headerVariant="create-listing">
        <div className="og-create-listing-page flex items-center justify-center min-h-[40vh] text-sm text-slate-400">
          Yükleniyor...
        </div>
      </Layout>
    );
  }

  if (!user) return <Redirect to="/giris" />;

  return (
    <Layout headerVariant="create-listing">
      <div className="og-create-listing-page">
        <input
          id="og-create-listing-search"
          type="search"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />

        {companyProfile === null && (
          <div className="og-cl-notice">
            İlan vermeden önce{" "}
            <Link href={`/profil/${user.username}`}>Şirket Bilgileri</Link>{" "}
            bölümünden firma adınızı kaydedebilirsiniz.
          </div>
        )}

        <section className="og-cl-smart" aria-label="Akıllı ayıklama">
          <div className="og-cl-smart__title">
            <Sparkles />
            Akıllı Ayıklama
          </div>
          <p className="og-cl-smart__hint">
            Kopyaladığın ilan metnini yapıştır, sistem alanları otomatik doldursun.
          </p>
          <textarea
            className="og-cl-smart__textarea"
            value={smartText}
            onChange={e => setSmartText(e.target.value)}
            placeholder={SAMPLE_TEXT}
          />
          <div className="og-cl-smart__actions">
            <button
              type="button"
              className="og-cl-smart__btn og-cl-smart__btn--ghost"
              onClick={() => { setSmartText(""); setExtractStatus(null); }}
              disabled={!smartText.trim()}
            >
              <Trash2 />
              Temizle
            </button>
            <button
              type="button"
              className="og-cl-smart__btn og-cl-smart__btn--primary"
              onClick={() => void parseSmartListing()}
              disabled={smartLoading || !smartText.trim()}
            >
              {smartLoading ? <RefreshCw className="animate-spin" /> : <Wand2 />}
              Otomatik Ayıkla
            </button>
          </div>
          {extractStatus && (
            <div className="og-cl-smart__status">
              {extractStatus.position && <span className="og-cl-status"><Check />Pozisyon bulundu</span>}
              {extractStatus.city && <span className="og-cl-status"><Check />Şehir bulundu</span>}
              {extractStatus.salary && <span className="og-cl-status"><Check />Maaş bulundu</span>}
              {extractStatus.workType && <span className="og-cl-status"><Check />Çalışma şekli bulundu</span>}
            </div>
          )}
        </section>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="og-cl-form-grid">
            <div className="og-cl-field">
              <label className="og-cl-label" htmlFor="cl-position">Pozisyon</label>
              <div className="og-cl-input-wrap">
                <Briefcase className="og-cl-field-ico" aria-hidden />
                <select
                  id="cl-position"
                  className="og-cl-select"
                  value={watched.title}
                  onChange={e => form.setValue("title", e.target.value, { shouldValidate: true })}
                >
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {form.formState.errors.title && <span className="og-cl-error">{form.formState.errors.title.message}</span>}
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label">Çalışma Şekli</label>
              <div className="og-cl-pills">
                {WORK_TYPES.map(w => (
                  <button
                    key={w}
                    type="button"
                    className={`og-cl-pill${watched.workType === w ? " og-cl-pill--active" : ""}`}
                    onClick={() => form.setValue("workType", w, { shouldValidate: true })}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label" htmlFor="cl-company">Firma Adı</label>
              <div className="og-cl-input-wrap">
                <Building2 className="og-cl-field-ico" aria-hidden />
                <input
                  id="cl-company"
                  className="og-cl-input"
                  value={watched.company || ""}
                  onChange={e => form.setValue("company", e.target.value)}
                  placeholder="Genser Güvenlik Sistemleri A.Ş."
                  readOnly={!!companyProfile}
                />
              </div>
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label">Vardiya</label>
              <div className="og-cl-pills">
                {SHIFTS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`og-cl-pill${shift === s ? " og-cl-pill--active" : ""}`}
                    onClick={() => { setShift(s); syncRequirements({ shift: s }); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label" htmlFor="cl-city">Şehir / İlçe</label>
              <div className="og-cl-input-wrap">
                <MapPin className="og-cl-field-ico" aria-hidden />
                <input
                  id="cl-city"
                  className="og-cl-input"
                  value={watched.city}
                  onChange={e => form.setValue("city", e.target.value, { shouldValidate: true })}
                  placeholder="İstanbul / Şişli"
                />
              </div>
              {form.formState.errors.city && <span className="og-cl-error">{form.formState.errors.city.message}</span>}
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label" htmlFor="cl-gender">Cinsiyet</label>
              <div className="og-cl-input-wrap">
                <select
                  id="cl-gender"
                  className="og-cl-select"
                  style={{ paddingLeft: 10 }}
                  value={gender}
                  onChange={e => { setGender(e.target.value); syncRequirements({ gender: e.target.value }); }}
                >
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label" htmlFor="cl-salary">Maaş</label>
              <div className="og-cl-input-wrap">
                <CircleDollarSign className="og-cl-field-ico" aria-hidden />
                <input
                  id="cl-salary"
                  className="og-cl-input"
                  value={watched.salary || ""}
                  onChange={e => form.setValue("salary", e.target.value)}
                  placeholder="41.178 TL"
                />
              </div>
            </div>

            <div className="og-cl-field">
              <label className="og-cl-label">Silahlı / Silahsız</label>
              <div className="og-cl-pills">
                {ARMED_OPTIONS.map(a => (
                  <button
                    key={a}
                    type="button"
                    className={`og-cl-pill${armed === a ? " og-cl-pill--active" : ""}`}
                    onClick={() => { setArmed(a); syncRequirements({ armed: a }); }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="og-cl-field og-cl-field--full">
            <label className="og-cl-label" htmlFor="cl-desc">Açıklama</label>
            <div className="og-cl-input-wrap">
              <FileText className="og-cl-field-ico" style={{ top: 14, transform: "none" }} aria-hidden />
              <textarea
                id="cl-desc"
                className="og-cl-textarea"
                style={{ paddingLeft: 32 }}
                value={watched.description}
                onChange={e => form.setValue("description", e.target.value, { shouldValidate: true })}
                placeholder="İş tanımı ve detaylar..."
              />
            </div>
            {form.formState.errors.description && <span className="og-cl-error">{form.formState.errors.description.message}</span>}
          </div>

          <div className="og-cl-field og-cl-field--full">
            <span className="og-cl-label">İmkanlar</span>
            <div className="og-cl-perks">
              {PERK_OPTIONS.map(p => {
                const on = perks.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`og-cl-perk${on ? " og-cl-perk--on" : ""}`}
                    onClick={() => {
                      const next = on ? perks.filter(x => x !== p) : [...perks, p];
                      setPerks(next);
                      syncRequirements({ perks: next });
                    }}
                  >
                    {on && <Check />}
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="og-cl-field og-cl-field--full">
            <label className="og-cl-label" htmlFor="cl-contact">İletişim</label>
            <div className="og-cl-input-wrap og-cl-input-wrap--right">
              <Phone className="og-cl-field-ico" aria-hidden />
              <input
                id="cl-contact"
                className="og-cl-input"
                value={watched.applyUrl || ""}
                onChange={e => form.setValue("applyUrl", e.target.value)}
                placeholder="0 (212) 555 12 34"
              />
              <Phone className="og-cl-field-ico-right" aria-hidden />
            </div>
          </div>

          {!companyProfile && (
            <div className="og-cl-field og-cl-field--full">
              <label className="og-cl-label">Firma Logosu (opsiyonel)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); }}
              />
              <button
                type="button"
                className="og-cl-smart__btn og-cl-smart__btn--ghost w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                Logo Yükle
              </button>
            </div>
          )}

          <div>
            <h2 className="og-cl-preview-head">İlan Özeti</h2>
            <article className="og-cl-preview" aria-label="İlan önizlemesi">
              <div className="og-cl-preview__logo">
                {previewLogo ? (
                  <img src={previewLogo} alt="" />
                ) : (
                  <div className="og-cl-preview__logo-fallback">
                    <Shield />
                    {previewCompany.split(" ").slice(0, 2).join(" ").toUpperCase()}
                  </div>
                )}
              </div>
              <div className="og-cl-preview__main">
                <span className="og-cl-preview__badge">YENİ</span>
                <h3 className="og-cl-preview__title">{watched.title || "Özel Güvenlik Görevlisi"}</h3>
                <div className="og-cl-preview__loc">
                  <MapPin />
                  <span>{watched.city || "Şehir / İlçe"}</span>
                </div>
                <div className="og-cl-preview__tags">
                  {previewTags.map(t => <span key={t} className="og-cl-preview__tag">{t}</span>)}
                </div>
              </div>
              <div className="og-cl-preview__aside">
                <div className="og-cl-preview__salary">
                  {previewSalary.amount}
                  {previewSalary.period && <span>{previewSalary.period}</span>}
                </div>
                <span className="og-cl-preview__apply">
                  <Send />
                  Başvur
                </span>
              </div>
            </article>
          </div>

          {dupWarning && <div className="og-cl-dup">{dupWarning}</div>}

          <button type="submit" className="og-cl-submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Yayınlanıyor...
              </span>
            ) : "İlanı Yayınla"}
          </button>
        </form>
      </div>
    </Layout>
  );
}
