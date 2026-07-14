import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { useDisplayMode } from "@/contexts/DisplayModeContext";
import { useToast } from "@/hooks/use-toast";
import "./nearby.css";

const RADII = [5, 10, 25, 50, 100] as const;
const PREFS_KEY = "nearbyListingsPreferences";

const FILTER_CHIPS = [
  { id: "today", label: "Bugün eklenenler" },
  { id: "parttime", label: "Part-time ilanlar" },
  { id: "night", label: "Gece vardiyası" },
  { id: "service", label: "Servis imkânı olanlar" },
  { id: "salary", label: "Maaşı belirtilenler" },
  { id: "armed", label: "Silahlı" },
  { id: "unarmed", label: "Silahsız" },
] as const;

const SORTS = [
  { id: "distance", label: "En yakın" },
  { id: "salary", label: "En yüksek maaş" },
  { id: "newest", label: "En yeni" },
  { id: "views", label: "En çok görüntülenen" },
] as const;

type Prefs = {
  radius: number;
  sort: string;
  filters: string[];
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { radius: 10, sort: "distance", filters: [] };
    const p = JSON.parse(raw) as Prefs;
    return {
      radius: RADII.includes(p.radius as (typeof RADII)[number]) ? p.radius : 10,
      sort: SORTS.some((s) => s.id === p.sort) ? p.sort : "distance",
      filters: Array.isArray(p.filters) ? p.filters : [],
    };
  } catch {
    return { radius: 10, sort: "distance", filters: [] };
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      radius: p.radius,
      sort: p.sort,
      filters: p.filters,
    }));
  } catch { /* ignore */ }
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function NearbySearchModal({ open, onClose }: Props) {
  const { isDesktop } = useDisplayMode();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [phase, setPhase] = useState<"main" | "manual" | "locating">("main");
  const [error, setError] = useState<string | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhase("main");
    setError(null);
    setPrefs(loadPrefs());
    void fetch("/api/listings/nearby/meta")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.provinces)) setProvinces(d.provinces);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!city) {
      setDistricts([]);
      setDistrict("");
      return;
    }
    void fetch(`/api/listings/nearby/meta?city=${encodeURIComponent(city)}`)
      .then((r) => r.json())
      .then((d) => {
        setDistricts(Array.isArray(d.districts) ? d.districts : []);
        setDistrict("");
      })
      .catch(() => setDistricts([]));
  }, [city]);

  const toggleFilter = (id: string) => {
    setPrefs((p) => {
      let filters = [...p.filters];
      if (id === "armed") filters = filters.filter((f) => f !== "unarmed");
      if (id === "unarmed") filters = filters.filter((f) => f !== "armed");
      if (filters.includes(id)) filters = filters.filter((f) => f !== id);
      else filters.push(id);
      const next = { ...p, filters };
      savePrefs(next);
      return next;
    });
  };

  const buildQuery = useCallback((extra: Record<string, string>) => {
    const sp = new URLSearchParams();
    sp.set("radius", String(prefs.radius));
    sp.set("sort", prefs.sort);
    if (prefs.filters.includes("today")) sp.set("date", "today");
    if (prefs.filters.includes("parttime")) sp.set("employmentType", "parttime");
    if (prefs.filters.includes("night")) sp.set("shift", "gece");
    if (prefs.filters.includes("service")) sp.set("service", "true");
    if (prefs.filters.includes("salary")) sp.set("salarySpecified", "true");
    if (prefs.filters.includes("armed")) sp.set("armedStatus", "silahli");
    if (prefs.filters.includes("unarmed")) sp.set("armedStatus", "silahsiz");
    for (const [k, v] of Object.entries(extra)) sp.set(k, v);
    return sp.toString();
  }, [prefs]);

  const goWithCoords = (lat: number, lng: number) => {
    savePrefs(prefs);
    onClose();
    navigate(`/yakindaki-ilanlar?${buildQuery({
      lat: lat.toFixed(5),
      lng: lng.toFixed(5),
    })}`);
  };

  const requestLocation = () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tarayıcınız konum servisini desteklemiyor. İl ve ilçe seçerek devam edebilirsiniz.");
      setPhase("manual");
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast({ title: "Konumunuz başarıyla bulundu." });
        goWithCoords(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setPhase("main");
        if (err.code === err.PERMISSION_DENIED) {
          setError("Konum izni verilmedi. İl ve ilçe seçerek yakınındaki ilanları görüntüleyebilirsin.");
          toast({ title: "Konum izni verilmedi." });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Konum servisi kapalı görünüyor. Cihaz ayarlarından konumu açabilir veya manuel seçim yapabilirsin.");
        } else {
          setError("Konumunuz alınamadı. Tekrar deneyebilir veya il ve ilçe seçebilirsin.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  const submitManual = () => {
    if (!city) {
      setError("Lütfen il seçin.");
      return;
    }
    savePrefs(prefs);
    onClose();
    const extra: Record<string, string> = { city };
    if (district) extra.district = district;
    navigate(`/yakindaki-ilanlar?${buildQuery(extra)}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="og-nearby-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="og-nearby-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="og-nearby-title"
            initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="og-nearby-sheet__handle" aria-hidden />
            <h2 id="og-nearby-title" className="og-nearby-sheet__title">Yakınımdaki İlanları Bul</h2>
            <p className="og-nearby-sheet__desc">
              Konumuna göre çevrendeki güncel özel güvenlik iş ilanlarını gösterelim.
            </p>

            {phase !== "manual" && (
              <>
                <div className="og-nearby-label">Mesafe</div>
                <div className="og-nearby-radii" role="group" aria-label="Mesafe">
                  {RADII.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`og-nearby-radius${prefs.radius === r ? " is-on" : ""}`}
                      onClick={() => {
                        const next = { ...prefs, radius: r };
                        setPrefs(next);
                        savePrefs(next);
                      }}
                    >
                      {r} km
                    </button>
                  ))}
                </div>

                <div className="og-nearby-label">Ek filtreler</div>
                <div className="og-nearby-chips">
                  {FILTER_CHIPS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`og-nearby-chip${prefs.filters.includes(c.id) ? " is-on" : ""}`}
                      onClick={() => toggleFilter(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="og-nearby-label">Sıralama</div>
                <div className="og-nearby-sorts">
                  {SORTS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`og-nearby-sort${prefs.sort === s.id ? " is-on" : ""}`}
                      onClick={() => {
                        const next = { ...prefs, sort: s.id };
                        setPrefs(next);
                        savePrefs(next);
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {phase === "manual" && (
              <div className="og-nearby-manual">
                <div className="og-nearby-label">İl</div>
                <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="İl">
                  <option value="">İl seçin</option>
                  {provinces.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <div className="og-nearby-label">İlçe</div>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  disabled={!city}
                  aria-label="İlçe"
                >
                  <option value="">{city ? "İlçe seçin (isteğe bağlı)" : "Önce il seçin"}</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <div className="og-nearby-label">Mesafe</div>
                <div className="og-nearby-radii">
                  {RADII.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`og-nearby-radius${prefs.radius === r ? " is-on" : ""}`}
                      onClick={() => setPrefs((p) => ({ ...p, radius: r }))}
                    >
                      {r} km
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="og-nearby-error" role="alert">{error}</div>}

            {phase === "locating" ? (
              <button type="button" className="og-nearby-primary" disabled>
                Konumunuz belirleniyor...
              </button>
            ) : phase === "manual" ? (
              <>
                <button type="button" className="og-nearby-primary" onClick={submitManual}>
                  İlanları Bul
                </button>
                <button type="button" className="og-nearby-secondary" onClick={() => { setPhase("main"); setError(null); }}>
                  Konum ile dene
                </button>
              </>
            ) : (
              <>
                <button type="button" className="og-nearby-primary" onClick={requestLocation}>
                  Konumumu Kullan ve İlanları Bul
                </button>
                <button type="button" className="og-nearby-secondary" onClick={() => { setPhase("manual"); setError(null); }}>
                  İl ve İlçe Seçerek Devam Et
                </button>
                {error?.includes("izin") && (
                  <button type="button" className="og-nearby-secondary" onClick={() => setPhase("manual")}>
                    İl ve İlçe Seç
                  </button>
                )}
              </>
            )}

            <p className="og-nearby-privacy">
              Konumunuz yalnızca yakındaki ilanları göstermek için kullanılır ve izniniz olmadan kalıcı olarak kaydedilmez.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
