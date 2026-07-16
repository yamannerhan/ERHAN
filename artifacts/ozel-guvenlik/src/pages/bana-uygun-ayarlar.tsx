import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import "./bana-uygun-isler.css";

type Meta = {
  provinces: string[];
  distances: Array<{ id: number | null; label: string }>;
  employmentTypes: Array<{ id: string; label: string }>;
  shifts: Array<{ id: string; label: string }>;
  licenses: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; label: string }>;
  benefits: Array<{ id: string; label: string }>;
  experience: Array<{ id: string; label: string }>;
  roles: Array<{ id: string; label: string }>;
};

type FormState = {
  preferredCities: string[];
  preferredDistricts: string[];
  nearbyDistrictsEnabled: boolean;
  maximumDistance: number | null;
  securityLicenseTypes: string[];
  securityLicenseExpiry: string;
  employmentTypes: string[];
  shiftPreferences: string[];
  projectTypes: string[];
  minimumSalary: string;
  benefits: string[];
  experienceLevel: string;
  preferredRoles: string[];
  drivingLicense: boolean;
  drivingLicenseType: string;
  drivesActively: boolean;
  srcCertificate: boolean;
  militaryStatus: string;
  height: string;
  weight: string;
  educationLevel: string;
  experienceYears: string;
};

const emptyForm = (): FormState => ({
  preferredCities: [],
  preferredDistricts: [],
  nearbyDistrictsEnabled: true,
  maximumDistance: 20,
  securityLicenseTypes: [],
  securityLicenseExpiry: "",
  employmentTypes: [],
  shiftPreferences: [],
  projectTypes: [],
  minimumSalary: "",
  benefits: [],
  experienceLevel: "",
  preferredRoles: [],
  drivingLicense: false,
  drivingLicenseType: "",
  drivesActively: false,
  srcCertificate: false,
  militaryStatus: "",
  height: "",
  weight: "",
  educationLevel: "",
  experienceYears: "",
});

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const STEPS = [
  "Konum",
  "Kimlik ve çalışma şekli",
  "Vardiya ve proje",
  "Maaş ve yan haklar",
  "Deneyim ve ek bilgiler",
  "Kontrol et ve kaydet",
];

export default function BanaUygunAyarlarPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hadPrefs, setHadPrefs] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/giris");
      return;
    }
    void (async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          fetch("/api/job-match/meta"),
          fetch("/api/job-match/prefs", { headers: { Authorization: `Bearer ${getToken()}` } }),
        ]);
        const m = await mRes.json() as Meta;
        setMeta(m);
        const p = await pRes.json() as { completed?: boolean; prefs?: Partial<FormState> | null };
        if (p.prefs && p.completed) {
          setHadPrefs(true);
          setForm({
            ...emptyForm(),
            preferredCities: p.prefs.preferredCities ?? [],
            preferredDistricts: p.prefs.preferredDistricts ?? [],
            nearbyDistrictsEnabled: p.prefs.nearbyDistrictsEnabled !== false,
            maximumDistance: (p.prefs.maximumDistance as number | null) ?? 20,
            securityLicenseTypes: p.prefs.securityLicenseTypes ?? [],
            securityLicenseExpiry: String(p.prefs.securityLicenseExpiry ?? ""),
            employmentTypes: p.prefs.employmentTypes ?? [],
            shiftPreferences: p.prefs.shiftPreferences ?? [],
            projectTypes: p.prefs.projectTypes ?? [],
            minimumSalary: p.prefs.minimumSalary != null ? String(p.prefs.minimumSalary) : "",
            benefits: p.prefs.benefits ?? [],
            experienceLevel: String(p.prefs.experienceLevel ?? ""),
            preferredRoles: p.prefs.preferredRoles ?? [],
            drivingLicense: !!p.prefs.drivingLicense,
            drivingLicenseType: String(p.prefs.drivingLicenseType ?? ""),
            drivesActively: !!p.prefs.drivesActively,
            srcCertificate: !!p.prefs.srcCertificate,
            militaryStatus: String(p.prefs.militaryStatus ?? ""),
            height: String(p.prefs.height ?? ""),
            weight: String(p.prefs.weight ?? ""),
            educationLevel: String(p.prefs.educationLevel ?? ""),
            experienceYears: String(p.prefs.experienceYears ?? ""),
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, navigate]);

  useEffect(() => {
    const city = form.preferredCities[0];
    if (!city) { setDistricts([]); return; }
    void fetch(`/api/job-match/districts?city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((j: { districts?: string[] }) => setDistricts(j.districts ?? []))
      .catch(() => setDistricts([]));
  }, [form.preferredCities]);

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const body = {
        ...form,
        minimumSalary: form.minimumSalary ? Number(form.minimumSalary) : null,
      };
      const res = await fetch("/api/job-match/prefs", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { success?: boolean; errors?: string[]; error?: string };
      if (!res.ok || !json.success) {
        setErrors(json.errors ?? [json.error || "Kayıt başarısız"]);
        return;
      }
      toast({ title: "Tercihler kaydedildi", description: "Uygun işler hazırlanıyor…" });
      navigate("/bana-uygun-isler");
    } catch {
      setErrors(["Bağlantı hatası"]);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !meta) {
    return (
      <Layout>
        <div className="og-jm-wizard"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="og-jm-wizard">
        <div className="og-jm-progress">Adım {step + 1} / {STEPS.length} — {STEPS[step]}</div>
        <div className="og-jm-bar"><span style={{ width: `${progress}%` }} /></div>

        <div className="og-jm-card">
          <h1>Bana Uygun İşler Ayarları</h1>
          <p>Tercihlerini doldur, sana en uygun özel güvenlik ilanlarını otomatik bulalım.</p>

          {step === 0 && (
            <>
              <div className="og-jm-label">Çalışmak istediğin iller</div>
              <select
                className="og-jm-select"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setForm((f) => ({
                    ...f,
                    preferredCities: f.preferredCities.includes(v) ? f.preferredCities : [...f.preferredCities, v],
                  }));
                }}
              >
                <option value="">İl ekle…</option>
                {meta.provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="og-jm-chips" style={{ marginTop: 8 }}>
                {form.preferredCities.map((c) => (
                  <button key={c} type="button" className="og-jm-chip is-on" onClick={() => setForm((f) => ({ ...f, preferredCities: f.preferredCities.filter((x) => x !== c), preferredDistricts: [] }))}>
                    {c} ×
                  </button>
                ))}
              </div>

              <div className="og-jm-label">İlçeler {form.preferredCities.length ? "" : "(önce il seç)"}</div>
              <div className="og-jm-multi">
                {form.preferredCities.length === 0 ? (
                  <div className="og-jm-check" style={{ color: "#94a3b8" }}>İl seçilmeden ilçe açılamaz</div>
                ) : districts.map((d) => (
                  <label key={d} className="og-jm-check">
                    <input
                      type="checkbox"
                      checked={form.preferredDistricts.includes(d)}
                      onChange={() => setForm((f) => ({ ...f, preferredDistricts: toggle(f.preferredDistricts, d) }))}
                    />
                    {d}
                  </label>
                ))}
              </div>

              <label className="og-jm-check" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={form.nearbyDistrictsEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, nearbyDistrictsEnabled: e.target.checked }))}
                />
                Yakın ilçelerdeki ilanları göster
              </label>

              <div className="og-jm-label">Maksimum çalışma mesafesi</div>
              <div className="og-jm-chips">
                {meta.distances.map((d) => (
                  <button
                    key={String(d.id)}
                    type="button"
                    className={`og-jm-chip${form.maximumDistance === d.id ? " is-on" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, maximumDistance: d.id }))}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="og-jm-label">Güvenlik kimlik bilgisi</div>
              <div className="og-jm-chips">
                {meta.licenses.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.securityLicenseTypes.includes(o.id) ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, securityLicenseTypes: toggle(f.securityLicenseTypes, o.id) }))}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="og-jm-label">Kimlik son geçerlilik (isteğe bağlı)</div>
              <input className="og-jm-input" placeholder="GG.AA.YYYY" value={form.securityLicenseExpiry} onChange={(e) => setForm((f) => ({ ...f, securityLicenseExpiry: e.target.value }))} />

              <div className="og-jm-label">Çalışma tercihi</div>
              <div className="og-jm-chips">
                {meta.employmentTypes.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.employmentTypes.includes(o.id) ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, employmentTypes: toggle(f.employmentTypes, o.id) }))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="og-jm-label">Vardiya tercihi</div>
              <div className="og-jm-chips">
                {meta.shifts.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.shiftPreferences.includes(o.id) ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, shiftPreferences: toggle(f.shiftPreferences, o.id) }))}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="og-jm-label">Proje türü</div>
              <div className="og-jm-chips">
                {meta.projects.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.projectTypes.includes(o.id) ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, projectTypes: toggle(f.projectTypes, o.id) }))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="og-jm-label">Minimum maaş beklentisi (isteğe bağlı)</div>
              <input className="og-jm-input" type="number" inputMode="numeric" placeholder="örn. 35000" value={form.minimumSalary} onChange={(e) => setForm((f) => ({ ...f, minimumSalary: e.target.value }))} />
              <div className="og-jm-label">Yan haklar</div>
              <div className="og-jm-chips">
                {meta.benefits.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.benefits.includes(o.id) ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, benefits: toggle(f.benefits, o.id) }))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="og-jm-label">Deneyim</div>
              <div className="og-jm-chips">
                {meta.experience.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.experienceLevel === o.id ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, experienceLevel: o.id }))}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="og-jm-label">Tercih edilen roller</div>
              <div className="og-jm-chips">
                {meta.roles.map((o) => (
                  <button key={o.id} type="button" className={`og-jm-chip${form.preferredRoles.includes(o.id) ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, preferredRoles: toggle(f.preferredRoles, o.id) }))}>
                    {o.label}
                  </button>
                ))}
              </div>
              <label className="og-jm-check"><input type="checkbox" checked={form.drivingLicense} onChange={(e) => setForm((f) => ({ ...f, drivingLicense: e.target.checked }))} /> Ehliyetim var</label>
              {form.drivingLicense && (
                <input className="og-jm-input" placeholder="Ehliyet sınıfı (B, C…)" value={form.drivingLicenseType} onChange={(e) => setForm((f) => ({ ...f, drivingLicenseType: e.target.value }))} />
              )}
              <label className="og-jm-check"><input type="checkbox" checked={form.drivesActively} onChange={(e) => setForm((f) => ({ ...f, drivesActively: e.target.checked }))} /> Aktif araç kullanıyorum</label>
              <label className="og-jm-check"><input type="checkbox" checked={form.srcCertificate} onChange={(e) => setForm((f) => ({ ...f, srcCertificate: e.target.checked }))} /> SRC belgem var</label>
              <div className="og-jm-label">Askerlik / Boy / Kilo / Eğitim (isteğe bağlı)</div>
              <input className="og-jm-input" placeholder="Askerlik durumu" value={form.militaryStatus} onChange={(e) => setForm((f) => ({ ...f, militaryStatus: e.target.value }))} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <input className="og-jm-input" placeholder="Boy (cm)" value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))} />
                <input className="og-jm-input" placeholder="Kilo (kg)" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
              </div>
              <input className="og-jm-input" style={{ marginTop: 8 }} placeholder="Eğitim durumu" value={form.educationLevel} onChange={(e) => setForm((f) => ({ ...f, educationLevel: e.target.value }))} />
              <input className="og-jm-input" style={{ marginTop: 8 }} placeholder="Tecrübe yılı" value={form.experienceYears} onChange={(e) => setForm((f) => ({ ...f, experienceYears: e.target.value }))} />
            </>
          )}

          {step === 5 && (
            <>
              <p>Özet: <strong>{form.preferredCities.join(", ") || "—"}</strong>
                {form.preferredDistricts.length ? ` · ${form.preferredDistricts.slice(0, 4).join(", ")}` : ""}
              </p>
              <p style={{ fontSize: 13 }}>
                {form.employmentTypes.length} çalışma şekli · {form.shiftPreferences.length} vardiya · {form.projectTypes.length} proje · {form.securityLicenseTypes.join(", ")}
              </p>
              <p style={{ fontSize: 13, color: "#64748b" }}>Kaydettiğinde uygun ilanlar hesaplanır ve sonuç sayfasına yönlendirilirsin.</p>
            </>
          )}

          {errors.map((e) => <div key={e} className="og-jm-error">{e}</div>)}

          <div className="og-jm-actions">
            {step > 0 ? (
              <button type="button" className="og-jm-btn-ghost" onClick={() => setStep((s) => s - 1)}>Geri</button>
            ) : (
              <button type="button" className="og-jm-btn-ghost" onClick={() => navigate("/bana-uygun-isler")}>Vazgeç</button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="og-jm-btn-primary" onClick={() => setStep((s) => s + 1)}>İleri</button>
            ) : (
              <button type="button" className="og-jm-btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Kaydediliyor…" : hadPrefs ? "Tercihlerimi Güncelle" : "Tercihlerimi Kaydet ve Uygun İşleri Bul"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
