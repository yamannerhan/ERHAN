import React, { useState, useEffect, useCallback, useRef } from "react";
import { useGetAnnouncements } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Phone, Car, User, Clock, Star, Plus, Pencil, Trash2,
  ChevronDown, ChevronUp, Check, X, Loader2, LogIn, UserPlus, Camera, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface Banner { id: number; title: string | null; imageUrl: string; linkUrl: string | null; }
interface Worker {
  id: number; userId: number; fullName: string; age: number; isRetired: boolean;
  gender: string; phone: string; city: string; district: string; hasVehicle: string;
  description: string | null; photoUrl: string | null; isFeatured: boolean;
  isBanned: boolean; status: string; createdAt: string;
}
interface CityCount { city: string; count: number; }

// ── Banner Carousel ─────────────────────────────────────────────────
function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);
  const next = useCallback(() => setCurrent(c => (c + 1) % banners.length), [banners.length]);
  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [next, banners.length]);
  if (banners.length === 0) return null;
  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "16/5" }}>
      <AnimatePresence mode="wait">
        <motion.div key={current} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.5 }} className="absolute inset-0">
          {banners[current]!.linkUrl
            ? <a href={banners[current]!.linkUrl!} target="_blank" rel="noopener noreferrer" className="block w-full h-full"><img src={banners[current]!.imageUrl} alt="" className="w-full h-full object-cover rounded-2xl" /></a>
            : <img src={banners[current]!.imageUrl} alt="" className="w-full h-full object-cover rounded-2xl" />}
          {banners[current]!.title && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl px-4 py-2.5">
              <p className="text-white text-xs font-semibold">{banners[current]!.title}</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {banners.length > 1 && (
        <>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {banners.map((_, i) => <button key={i} onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${i === current ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />)}
          </div>
          <button onClick={() => setCurrent(c => (c - 1 + banners.length) % banners.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center z-10 text-base">‹</button>
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center z-10 text-base">›</button>
        </>
      )}
    </div>
  );
}

// ── Worker Card ─────────────────────────────────────────────────────
function WorkerCard({ w, isAdmin, onFeature, onBan, onDelete, isMine }: {
  w: Worker; isAdmin?: boolean;
  onFeature?: (id: number) => void;
  onBan?: (id: number, ban: boolean) => void;
  onDelete?: (id: number) => void;
  isMine?: boolean;
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const vehicleIcon = w.hasVehicle === "Yok" ? null : w.hasVehicle === "Motor" ? "🏍️" : "🚗";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative glass-card rounded-2xl p-4 ${w.isFeatured
        ? "border border-amber-400/70 animate-pt-glow"
        : "border border-white/5"}`}
    >
      {w.isFeatured && (
        <div className="absolute -top-2.5 left-4 bg-amber-500 text-amber-950 text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <Star className="w-2.5 h-2.5" /> ÖNE ÇIKAN
        </div>
      )}
      <div className="flex items-start gap-3">
        {w.photoUrl ? (
          <img src={w.photoUrl} alt={w.fullName} className="w-14 h-14 rounded-xl object-cover shrink-0 ring-2 ring-white/10" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-secondary/20 flex items-center justify-center shrink-0 text-2xl font-bold border border-white/10">
            {w.gender === "Bayan" ? "👩" : "👨"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{w.fullName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${w.gender === "Bayan" ? "bg-pink-500/20 text-pink-300" : "bg-blue-500/20 text-blue-300"}`}>{w.gender}</span>
            {w.isRetired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold">Emekli</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{w.age} yaş</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{w.city} / {w.district}</span>
            {vehicleIcon && <span className="flex items-center gap-1">{vehicleIcon} {w.hasVehicle}</span>}
          </div>
          {w.description && (
            <div className="mt-2">
              <p
                onClick={() => setDescExpanded(e => !e)}
                className={`text-xs text-foreground/70 leading-relaxed cursor-pointer select-none transition-all ${descExpanded ? "" : "line-clamp-2"}`}
              >
                {w.description}
              </p>
              {!descExpanded && w.description.length > 80 && (
                <button
                  onClick={() => setDescExpanded(true)}
                  className="text-[10px] text-primary/70 mt-0.5 hover:text-primary transition-colors"
                >
                  daha fazla
                </button>
              )}
              {descExpanded && (
                <button
                  onClick={() => setDescExpanded(false)}
                  className="text-[10px] text-primary/70 mt-0.5 hover:text-primary transition-colors"
                >
                  gizle
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mt-2.5">
            <a href={`tel:${w.phone}`} className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">
              <Phone className="w-3.5 h-3.5" />{w.phone}
            </a>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(w.createdAt).toLocaleDateString("tr-TR")}
            </span>
          </div>
        </div>
      </div>
      {(isAdmin || isMine) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
          {isAdmin && (
            <>
              <button onClick={() => onFeature?.(w.id)} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${w.isFeatured ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}>
                {w.isFeatured ? "Öne çıkan kaldır" : "Öne çıkar"}
              </button>
              <button onClick={() => onBan?.(w.id, !w.isBanned)} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${w.isBanned ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                {w.isBanned ? "Yasağı kaldır" : "Yasakla"}
              </button>
            </>
          )}
          {(isMine || isAdmin) && (
            <button onClick={() => onDelete?.(w.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold ml-auto transition-colors flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Sil
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── İl listesi ─────────────────────────────────────────────────────
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

// ── Main Component ──────────────────────────────────────────────────
export default function PartTime() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: announcementsData } = useGetAnnouncements();
  const announcements = announcementsData || [];
  const [banners, setBanners] = useState<Banner[]>([]);
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

  // ── Data fetching ─────────────────────────────────────────────────
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
    fetch("/api/banners").then(r => r.json()).then(d => setBanners(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

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

  // ── Submit ────────────────────────────────────────────────────────
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

  // Öne çıkanlar her zaman üstte — sunucu sıralamasına ek frontend garantisi
  const sortedWorkers = [...workers].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const featuredWorkers = sortedWorkers.filter(w => w.isFeatured);
  const regularWorkers = sortedWorkers.filter(w => !w.isFeatured);

  return (
    <Layout>
      <div className="pb-28">
        {/* ── Kayan duyurular ─────────────────────────────────────────── */}
        {announcements.length > 0 && (
          <div className="bg-primary/10 border-b border-primary/20 overflow-hidden relative h-9 flex items-center">
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="flex animate-ticker whitespace-nowrap" style={{ animationDelay: `-${((Date.now() / 1000) % 60).toFixed(2)}s` }}>
              {[...announcements, ...announcements].map((a, i) => (
                <span key={i} className="inline-flex items-center gap-2 mx-8 text-xs font-medium text-primary/90">
                  <span className="text-primary">●</span>{a.content}
                </span>
              ))}
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          </div>
        )}

        <div className="p-4 space-y-4">
          {/* ── Banner ────────────────────────────────────────────────── */}
          {banners.length > 0 && <BannerCarousel banners={banners} />}

          {/* ── Başlık ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Part Time
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">Günlük & geçici güvenlik personeli</p>
            </div>
            {user && (
              <Button
                size="sm"
                onClick={() => setTab(tab === "basvur" ? "liste" : "basvur")}
                className="bg-gradient-to-r from-primary to-secondary text-white rounded-xl gap-1.5 text-xs"
              >
                {tab === "basvur" ? <><X className="w-3.5 h-3.5" />Kapat</> : <><Plus className="w-3.5 h-3.5" />{myListing ? "Kaydımı Düzenle" : "Sıraya Gir"}</>}
              </Button>
            )}
          </div>

          {/* ── Giriş yapmayanlar için CTA ────────────────────────────── */}
          {!user && (
            <div className="glass-card rounded-2xl p-4 border border-primary/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Sıraya girmek ister misiniz?</p>
                <p className="text-xs text-muted-foreground">Üye olun, part time listesine eklenin</p>
              </div>
              <Link href="/kayit">
                <Button size="sm" className="bg-primary text-white rounded-xl text-xs shrink-0">
                  Kayıt Ol
                </Button>
              </Link>
            </div>
          )}

          {/* ── Başvuru / Düzenleme Formu ─────────────────────────────── */}
          <AnimatePresence>
            {tab === "basvur" && user && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card rounded-2xl overflow-hidden border border-primary/20"
              >
                <div className="p-4 space-y-3">
                  <h2 className="font-bold text-sm text-primary">{myListing ? "Kaydımı Güzenle" : "Part Time Listesine Katıl"}</h2>

                  {/* Fotoğraf */}
                  {myListing && (
                    <div className="flex items-center gap-3">
                      {myListing.photoUrl
                        ? <img src={myListing.photoUrl} className="w-16 h-16 rounded-xl object-cover ring-2 ring-primary/30" alt="" />
                        : <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 text-2xl">{myListing.gender === "Bayan" ? "👩" : "👨"}</div>
                      }
                      <div>
                        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
                        <Button size="sm" variant="outline" className="border-white/10 text-xs gap-1.5" onClick={() => photoInputRef.current?.click()}>
                          <Camera className="w-3.5 h-3.5" />Fotoğraf Değiştir
                        </Button>
                        <p className="text-[10px] text-muted-foreground mt-1">İsteğe bağlı</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Ad Soyad *</label>
                      <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Ahmet Yılmaz" className="glass-card border-white/10" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Yaş *</label>
                      <Input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="35" min={18} max={70} className="glass-card border-white/10" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Cinsiyet</label>
                      <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                        <option>Bay</option><option>Bayan</option>
                      </select>
                    </div>
                    <div className="col-span-2 flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                      <input type="checkbox" id="isRetired" checked={form.isRetired} onChange={e => setForm(f => ({ ...f, isRetired: e.target.checked }))} className="w-4 h-4 accent-primary" />
                      <label htmlFor="isRetired" className="text-sm cursor-pointer select-none">Emekliyim</label>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">İl *</label>
                      <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                        <option value="">Seçin</option>
                        {ILLER.map(il => <option key={il}>{il}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">İlçe *</label>
                      <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="İlçe adı" className="glass-card border-white/10" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Telefon *</label>
                      <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0555 555 55 55" className="glass-card border-white/10" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Araç / Vasıta</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["Yok", "Motor", "Araba"].map(v => (
                          <button key={v} onClick={() => setForm(f => ({ ...f, hasVehicle: v }))}
                            className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${form.hasVehicle === v ? "bg-primary/20 border-primary/50 text-primary" : "bg-white/5 border-white/10 text-muted-foreground"}`}>
                            {v === "Motor" ? "🏍️ Motor" : v === "Araba" ? "🚗 Araba" : "✖ Yok"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Açıklama</label>
                      <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Deneyimleriniz, çalışabileceğiniz saatler, özel beceriler..."
                        rows={3} maxLength={300}
                        className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
                    </div>
                  </div>

                  <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-gradient-to-r from-primary to-secondary text-white">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    {myListing ? "Güncelle" : "Sıraya Gir"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Şehir Filtreleri ──────────────────────────────────────── */}
          {cities.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-2 font-medium">Hızlı Şehir Filtresi</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setSelectedCity(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${!selectedCity ? "bg-primary text-white border-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"}`}
                >
                  Tümü ({workers.length})
                </button>
                {cities.map(c => (
                  <button
                    key={c.city}
                    onClick={() => setSelectedCity(selectedCity === c.city ? null : c.city)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${selectedCity === c.city ? "bg-primary text-white border-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"}`}
                  >
                    {c.city} ({c.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Liste ─────────────────────────────────────────────────── */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : workers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground glass-card rounded-2xl">
              <p className="font-semibold">Henüz kayıt yok</p>
              <p className="text-xs mt-1">{selectedCity ? `${selectedCity} ilinde kayıtlı personel bulunamadı` : "İlk sıraya giren siz olun!"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Öne Çıkanlar — her zaman en üstte */}
              {featuredWorkers.length > 0 && (
                <>
                  <p className="text-xs font-bold text-amber-400 flex items-center gap-1"><Star className="w-3.5 h-3.5" />Öne Çıkanlar</p>
                  {featuredWorkers.map(w => (
                    <WorkerCard key={w.id} w={w} isAdmin={isAdmin} onFeature={handleFeature} onBan={handleBan} onDelete={handleDelete} isMine={w.userId === user?.id} />
                  ))}
                </>
              )}
              {/* Benim Kaydım — öne çıkan değilse öne çıkanlardan hemen sonra */}
              {myListing && tab === "liste" && !myListing.isFeatured && (
                <>
                  <div className="border-t border-white/5 pt-1"><p className="text-xs text-primary/70 font-semibold">Benim Kaydım</p></div>
                  <WorkerCard w={myListing} isMine onDelete={handleDelete} isAdmin={isAdmin} onFeature={handleFeature} onBan={handleBan} />
                </>
              )}
              {/* Diğerleri */}
              {(featuredWorkers.length > 0 || (myListing && !myListing.isFeatured)) && regularWorkers.filter(w => w.userId !== user?.id).length > 0 && (
                <div className="border-t border-white/5 pt-1"><p className="text-xs text-muted-foreground font-medium">Diğerleri</p></div>
              )}
              {regularWorkers.filter(w => w.userId !== user?.id).map(w => (
                <WorkerCard key={w.id} w={w} isAdmin={isAdmin} onFeature={handleFeature} onBan={handleBan} onDelete={handleDelete} isMine={false} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
