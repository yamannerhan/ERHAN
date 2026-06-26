import React, { useState, useEffect, useCallback, useRef } from "react";
import { useGetAnnouncements } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Phone, User, Clock, Star, Plus, Trash2, Check, X, Loader2, Camera,
  ShieldCheck, Briefcase, Building2, Users, Flame, Newspaper, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface Worker {
  id: number; userId: number; fullName: string; age: number; isRetired: boolean;
  gender: string; phone: string; city: string; district: string; hasVehicle: string;
  description: string | null; photoUrl: string | null; isFeatured: boolean;
  isBanned: boolean; status: string; createdAt: string;
}
interface CityCount { city: string; count: number; }

const ILLER = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin",
  "Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale",
  "Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum",
  "Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin",
  "İstanbul","İzmir","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli",
  "Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş",
  "Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas",
  "Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat",
  "Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın",
  "Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"
];

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Az önce";
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function SafeAvatar({ photoUrl, gender, altName }: { photoUrl?: string | null; gender: string; altName: string }) {
  const [failed, setFailed] = useState(false);
  const isFemale = gender === "Bayan";

  if (!photoUrl || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="opacity-90">
          <circle cx="22" cy="12" r="7" fill={isFemale ? "#f9a8d4" : "#93c5fd"} />
          <path
            d={isFemale
              ? "M22 21c-6.5 0-12 4-12 9h24c0-5-5.5-9-12-9z"
              : "M22 20c-5 0-9.5 3.5-10.5 7.5h21c-1-4-5.5-7.5-10.5-7.5z"}
            fill={isFemale ? "#ec4899" : "#3b82f6"}
          />
          <circle cx="22" cy="12" r="12" stroke={isFemale ? "#f472b6" : "#60a5fa"} strokeWidth="1.5" opacity="0.25" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={altName}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

// ── Worker Row Card ─────────────────────────────────────────────────
function WorkerRow({ w, isAdmin, onFeature, onBan, onDelete, isMine }: {
  w: Worker; isAdmin?: boolean;
  onFeature?: (id: number) => void;
  onBan?: (id: number, ban: boolean) => void;
  onDelete?: (id: number) => void;
  isMine?: boolean;
}) {
  const isMotor = w.hasVehicle === "Motor";
  const isCar = w.hasVehicle === "Araba";
  const vehicleEmoji = isMotor ? "🏍️" : isCar ? "🚗" : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`og-pt-row ${w.isFeatured ? "og-pt-row-featured" : ""}`}
    >
      <div className="og-pt-img">
        <SafeAvatar photoUrl={w.photoUrl} gender={w.gender} altName={w.fullName} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {w.isFeatured && (
            <span className="og-status og-status-featured">
              <Star className="w-2.5 h-2.5 fill-current" /> Öne Çıkan
            </span>
          )}
          <span className={`og-status ${w.gender === "Bayan" ? "og-gender-bayan" : "og-gender-bay"}`}>
            {w.gender}
          </span>
          {w.isRetired && (
            <span className="og-status" style={{ background: "rgba(168,85,247,0.18)", color: "#d8b4fe", border: "1px solid rgba(168,85,247,0.35)" }}>
              Emekli
            </span>
          )}
        </div>

        <h3 className="og-list-title">{w.fullName}</h3>

        <div className="flex items-center gap-2 text-[11px] og-text-muted mt-0.5 flex-wrap">
          <span className="inline-flex items-center gap-1">
            {isMotor ? <span>🏍</span> : <MapPin className="w-3 h-3 shrink-0" />}
            <span className="truncate">{w.city} / {w.district}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <User className="w-3 h-3" /> {w.age} yaş
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className="og-mini-chip">Tam Zamanlı</span>
          <span className="og-mini-chip">Günlük</span>
          {vehicleEmoji && <span className="og-mini-chip">{vehicleEmoji} {w.hasVehicle}</span>}
        </div>

        {w.description && (
          <p className="text-[11px] og-text-muted mt-1 line-clamp-2 leading-relaxed">
            {w.description}
          </p>
        )}

        <div className="og-list-foot">
          <a
            href={`tel:${w.phone}`}
            onClick={e => e.stopPropagation()}
            className="og-text-muted text-[10px] truncate inline-flex items-center gap-1 hover:text-amber-400 transition-colors"
          >
            <Phone className="w-3 h-3" />
            {w.phone}
          </a>
          <button type="button" onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${w.phone}`; }} className="og-pt-detail-btn">
            Hemen Ara
          </button>
        </div>
      </div>

      {(isAdmin || isMine) && (
        <div className="absolute -bottom-2 left-3 right-3 flex gap-1.5">
          {isAdmin && (
            <>
              <button onClick={() => onFeature?.(w.id)} className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${w.isFeatured ? "bg-amber-400 text-slate-900" : "bg-slate-900 text-amber-400 border border-amber-400/40"}`}>
                {w.isFeatured ? "★ Öne çıkan" : "★ Öne çıkar"}
              </button>
              <button onClick={() => onBan?.(w.id, !w.isBanned)} className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${w.isBanned ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"}`}>
                {w.isBanned ? "Yasağı kaldır" : "Yasakla"}
              </button>
            </>
          )}
          {(isMine || isAdmin) && (
            <button onClick={() => onDelete?.(w.id)} className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold ml-auto inline-flex items-center gap-1">
              <Trash2 className="w-2.5 h-2.5" /> Sil
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Main Component ──────────────────────────────────────────────────
export default function PartTime() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: announcementsData } = useGetAnnouncements();
  const announcements = announcementsData || [];
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [cities, setCities] = useState<CityCount[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"liste" | "basvur">("liste");
  const [myListing, setMyListing] = useState<Worker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({
    fullName: "", age: "", isRetired: false, gender: "Bay",
    phone: "", city: "", district: "", hasVehicle: "Yok", description: "",
  });

  const isAdmin = user?.role === "admin" || user?.role === "moderator";

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCity) params.set("city", selectedCity);
    const [wRes, cRes] = await Promise.all([
      fetch(`/api/parttime?${params}`).then(r => r.json()).catch(() => []),
      fetch("/api/parttime/cities").then(r => r.json()).catch(() => []),
    ]);
    setWorkers(Array.isArray(wRes) ? wRes : []);
    setCities(Array.isArray(cRes) ? cRes : []);
    setLoading(false);
  }, [selectedCity]);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/parttime/mine", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setMyListing(d)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (myListing) {
      setForm({
        fullName: myListing.fullName, age: String(myListing.age),
        isRetired: myListing.isRetired, gender: myListing.gender,
        phone: myListing.phone, city: myListing.city, district: myListing.district,
        hasVehicle: myListing.hasVehicle, description: myListing.description || "",
      });
    } else if (user) {
      setForm(f => ({
        ...f,
        fullName: (user as any).fullName || (user as any).displayName || "",
        phone: (user as any).phone || "",
      }));
    }
  }, [myListing, user]);

  const handleSubmit = async () => {
    if (!form.fullName || !form.age || !form.phone || !form.city || !form.district) {
      toast({ title: "Zorunlu alanları doldurun", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const method = myListing ? "PATCH" : "POST";
      const url = myListing ? `/api/parttime/${myListing.id}` : "/api/parttime";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...form, age: Number(form.age) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "İşlem başarısız");
      }
      const data = await res.json();
      setMyListing(data);
      toast({ title: myListing ? "Kaydınız güncellendi" : "Sıraya eklendiniz!" });
      setTab("liste");
      fetchWorkers();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Kaydı silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/parttime/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (myListing?.id === id) setMyListing(null);
    fetchWorkers();
    toast({ title: "Kayıt silindi" });
  };

  const handleFeature = async (id: number) => {
    const res = await fetch(`/api/parttime/${id}/feature`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) { fetchWorkers(); toast({ title: "Öne çıkarma güncellendi" }); }
  };

  const handleBan = async (id: number, ban: boolean) => {
    const reason = ban ? prompt("Yasaklama sebebi:") || "Kural ihlali" : "";
    const res = await fetch(`/api/parttime/${id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ban, reason }),
    });
    if (res.ok) { fetchWorkers(); toast({ title: ban ? "Yasaklandı" : "Yasak kaldırıldı" }); }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!myListing) return;
    const formData = new FormData();
    formData.append("photo", file);
    const res = await fetch(`/api/parttime/${myListing.id}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      setMyListing(data);
      fetchWorkers();
      toast({ title: "Fotoğraf güncellendi" });
    }
  };

  // Sort: featured first, then newest
  const sortedWorkers = [...workers].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const featuredWorkers = sortedWorkers.filter(w => w.isFeatured);
  const regularWorkers = sortedWorkers.filter(w => !w.isFeatured);

  // Stats
  const totalActive = workers.length;
  const distinctCompanies = cities.length;  // approx — distinct cities reflects spread
  const totalRegistered = workers.length;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const newToday = workers.filter(w => new Date(w.createdAt).getTime() > dayAgo).length;

  // Latest announcement for ticker
  const latestAnnouncement = announcements[0]?.content || "Sıraya gir, hızlı başvuru için profilini güncelle!";

  return (
    <Layout>
      <div className="p-4 space-y-5">

        {/* ── Breaking News Ticker ─────────────────────────── */}
        <section className="og-news-ticker">
          <span className="og-news-ticker-label">
            <Newspaper className="w-3 h-3" /> Son Dakika
          </span>
          <span className="og-news-ticker-text">{latestAnnouncement}</span>
          <span className="og-news-ticker-badge">
            <Flame className="w-2.5 h-2.5" /> Bugün
          </span>
        </section>

        {/* ── Hero Banner ──────────────────────────────────── */}
        <section className="og-pt-hero">
          <div className="og-pt-hero-art">
            <span className="og-pt-hero-flag">🇹🇷</span>
            <div className="og-pt-hero-shield-bg">
              <ShieldCheck />
            </div>
          </div>
          <div className="og-pt-hero-eyebrow">ÖZELGÜVENLİK.ONLINE | DİJİTAL ÖZEL GÜVENLİK SİSTEMİ</div>
          <h2 className="og-pt-hero-title">GÜVENLİK SEKTÖRÜNÜN DİJİTAL MERKEZİ</h2>
          <p className="og-pt-hero-sub">
            Binlerce güncel ilan, güvenlik firmaları ve hızlı başvuru sistemi ile kariyerinize güvenli bir adım atın!
          </p>
          <div className="og-pt-hero-links">
            <Link href="/ilanlar" className="og-pt-hero-link">
              <Newspaper className="w-3 h-3" /> GÜNCEL İLANLAR
            </Link>
            <Link href="/ilanlar" className="og-pt-hero-link">
              <Building2 className="w-3 h-3" /> GÜVENLİK FİRMALAR
            </Link>
            <Link href="/cv-olustur" className="og-pt-hero-link">
              <Zap className="w-3 h-3" /> HIZLI BAŞVURU
            </Link>
          </div>
          <div className="og-pt-hero-dots">
            <span className="og-pt-hero-dot og-pt-hero-dot-active" />
            <span className="og-pt-hero-dot" />
            <span className="og-pt-hero-dot" />
          </div>
        </section>

        {/* ── Page Heading ─────────────────────────────────── */}
        <section className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="og-page-title">Part Time</h1>
            <p className="og-page-sub">Günlük & geçici güvenlik personeli</p>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => setTab(tab === "basvur" ? "liste" : "basvur")}
              className="og-filter-btn shrink-0"
            >
              {tab === "basvur" ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {tab === "basvur" ? "Kapat" : myListing ? "Düzenle" : "Sıraya Gir"}
            </button>
          ) : (
            <Link href="/kayit" className="og-filter-btn shrink-0">
              <Plus className="w-3.5 h-3.5" /> Sıraya Gir
            </Link>
          )}
        </section>

        {/* ── Stats Row ────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="og-stat-card">
            <div className="og-stat-icon"><User className="w-4 h-4" /></div>
            <div className="og-stat-value">{totalActive}</div>
            <div className="og-stat-label">Aktif İlan</div>
          </div>
          <div className="og-stat-card">
            <div className="og-stat-icon"><Building2 className="w-4 h-4" /></div>
            <div className="og-stat-value">{distinctCompanies}</div>
            <div className="og-stat-label">Şehir</div>
          </div>
          <div className="og-stat-card">
            <div className="og-stat-icon"><Users className="w-4 h-4" /></div>
            <div className="og-stat-value">{totalRegistered}</div>
            <div className="og-stat-label">Kayıtlı Personel</div>
          </div>
          <div className="og-stat-card">
            <div className="og-stat-icon"><Clock className="w-4 h-4" /></div>
            <div className="og-stat-value">{newToday}</div>
            <div className="og-stat-label">Bugün Eklenen</div>
          </div>
        </section>

        {/* ── Login CTA ────────────────────────────────────── */}
        {!user && (
          <div className="og-list-row" style={{ borderColor: "rgba(250,204,21,0.32)" }}>
            <div className="og-setting-icon"><ShieldCheck className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Sıraya girmek ister misiniz?</p>
              <p className="text-xs og-text-muted">Üye olun, part time listesine eklenin.</p>
            </div>
            <Link href="/kayit" className="og-pt-detail-btn">
              Kayıt Ol
            </Link>
          </div>
        )}

        {/* ── Application form ─────────────────────────────── */}
        <AnimatePresence>
          {tab === "basvur" && user && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="og-setting-row flex-col items-stretch gap-3 p-4">
                <h2 className="og-section-title text-amber-400">{myListing ? "Kaydımı Düzenle" : "Part Time Listesine Katıl"}</h2>

                {myListing && (
                  <div className="flex items-center gap-3">
                    {myListing.photoUrl
                      ? (
                        <div className="w-16 h-16 rounded-xl ring-2 ring-amber-400/30 overflow-hidden">
                          <SafeAvatar photoUrl={myListing.photoUrl} gender={myListing.gender} altName={myListing.fullName} />
                        </div>
                      )
                      : (
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border border-white/10">
                          <SafeAvatar photoUrl={null} gender={myListing.gender} altName={myListing.fullName} />
                        </div>
                      )
                    }
                    <div>
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
                      <Button size="sm" variant="outline" className="border-white/10 text-xs gap-1.5" onClick={() => photoInputRef.current?.click()}>
                        <Camera className="w-3.5 h-3.5" />Fotoğraf Değiştir
                      </Button>
                      <p className="text-[10px] og-text-muted mt-1">İsteğe bağlı</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs og-text-muted mb-1 block">Ad Soyad *</label>
                    <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Ahmet Yılmaz" />
                  </div>
                  <div>
                    <label className="text-xs og-text-muted mb-1 block">Yaş *</label>
                    <Input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="35" min={18} max={70} />
                  </div>
                  <div>
                    <label className="text-xs og-text-muted mb-1 block">Cinsiyet</label>
                    <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-400/50">
                      <option>Bay</option><option>Bayan</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                    <input type="checkbox" id="isRetired" checked={form.isRetired} onChange={e => setForm(f => ({ ...f, isRetired: e.target.checked }))} className="w-4 h-4 accent-amber-400" />
                    <label htmlFor="isRetired" className="text-sm cursor-pointer select-none">Emekliyim</label>
                  </div>
                  <div>
                    <label className="text-xs og-text-muted mb-1 block">İl *</label>
                    <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-400/50">
                      <option value="">Seçin</option>
                      {ILLER.map(il => <option key={il}>{il}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs og-text-muted mb-1 block">İlçe *</label>
                    <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="İlçe adı" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs og-text-muted mb-1 block">Telefon *</label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0555 555 55 55" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs og-text-muted mb-1 block">Araç / Vasıta</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["Yok", "Motor", "Araba"].map(v => (
                        <button key={v} type="button" onClick={() => setForm(f => ({ ...f, hasVehicle: v }))}
                          className={`py-2 rounded-xl text-xs font-bold border transition-colors ${form.hasVehicle === v ? "bg-amber-400 border-amber-400 text-slate-900" : "bg-white/5 border-white/10 text-muted-foreground"}`}>
                          {v === "Motor" ? "🏍️ Motor" : v === "Araba" ? "🚗 Araba" : "✖ Yok"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs og-text-muted mb-1 block">Açıklama</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Deneyimleriniz, çalışabileceğiniz saatler, özel beceriler..."
                      rows={3} maxLength={300}
                      className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-400/50 resize-none" />
                  </div>
                </div>

                <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  {myListing ? "Güncelle" : "Sıraya Gir"}
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Hızlı Şehir Filtresi ─────────────────────────── */}
        <section>
          <p className="text-[11px] og-text-muted mb-2 font-semibold">Hızlı Şehir Filtresi</p>
          <div className="og-pills hide-scrollbar">
            <button
              onClick={() => setSelectedCity(null)}
              className={`og-pill ${!selectedCity ? "og-pill-active" : ""}`}
            >
              Tümü ({totalActive})
            </button>
            {cities.slice(0, 5).map(c => (
              <button
                key={c.city}
                onClick={() => setSelectedCity(selectedCity === c.city ? null : c.city)}
                className={`og-pill ${selectedCity === c.city ? "og-pill-active" : ""}`}
              >
                {c.city} ({c.count})
              </button>
            ))}
            {cities.length > 5 && (
              <button className="og-pill">
                ··· Diğer
              </button>
            )}
          </div>
        </section>

        {/* ── List ─────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => <div key={i} className="og-list-skeleton" />)}
          </div>
        ) : workers.length === 0 ? (
          <div className="og-empty">
            <Users className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm font-semibold">Henüz kayıt yok</p>
            <p className="text-xs mt-1">{selectedCity ? `${selectedCity} ilinde kayıtlı personel bulunamadı` : "İlk sıraya giren siz olun!"}</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featuredWorkers.length > 0 && (
              <section>
                <h2 className="og-section-title flex items-center gap-1.5 mb-3">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  Öne Çıkan İlanlar
                </h2>
                <div className="space-y-3">
                  {featuredWorkers.map(w => (
                    <WorkerRow key={w.id} w={w} isAdmin={isAdmin} onFeature={handleFeature} onBan={handleBan} onDelete={handleDelete} isMine={w.userId === user?.id} />
                  ))}
                </div>
              </section>
            )}

            {/* My listing */}
            {myListing && tab === "liste" && !myListing.isFeatured && (
              <section>
                <p className="text-xs text-amber-400 font-bold mb-2">Benim Kaydım</p>
                <WorkerRow w={myListing} isMine onDelete={handleDelete} isAdmin={isAdmin} onFeature={handleFeature} onBan={handleBan} />
              </section>
            )}

            {/* Others */}
            {regularWorkers.filter(w => w.userId !== user?.id).length > 0 && (
              <section>
                {(featuredWorkers.length > 0 || (myListing && !myListing.isFeatured)) && (
                  <h2 className="og-section-title mb-3">Tüm Kayıtlar</h2>
                )}
                <div className="space-y-3">
                  {regularWorkers.filter(w => w.userId !== user?.id).map(w => (
                    <WorkerRow key={w.id} w={w} isAdmin={isAdmin} onFeature={handleFeature} onBan={handleBan} onDelete={handleDelete} isMine={false} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
