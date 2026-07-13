import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, User, Clock, Star, Trash2, Check, X, Loader2, Camera,
  ShieldCheck, Users, Search, Send, Eye, Bookmark, ClipboardList, Sparkles,
  Moon, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { LiveSupportBar } from "@/components/live-support-bar";
import "@/components/part-time-page.css";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

interface Worker {
  id: number; userId: number; fullName: string; age: number; isRetired: boolean;
  gender: string; phone: string; city: string; district: string; hasVehicle: string;
  description: string | null; photoUrl: string | null; isFeatured: boolean;
  isBanned: boolean; status: string; createdAt: string;
}

type EnrichedWorker = Worker & {
  headline: string;
  dailyRate: string;
  shiftTags: string[];
  filterTags: string[];
};

const FILTER_PILLS = [
  { id: "all", label: "İş Arayanlar" },
  { id: "gunluk", label: "Günlük" },
  { id: "saatlik", label: "Saatlik" },
  { id: "gece", label: "Gece" },
  { id: "hafta-sonu", label: "Hafta Sonu" },
  { id: "etkinlik", label: "Etkinlik" },
] as const;

type FilterId = (typeof FILTER_PILLS)[number]["id"];

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
  "Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce",
];

function enrichWorker(w: Worker): EnrichedWorker {
  const blob = `${w.description ?? ""} ${w.hasVehicle}`.toLocaleLowerCase("tr-TR");
  const shiftTags: string[] = [];
  const filterTags: string[] = [];
  if (/gece/.test(blob)) { shiftTags.push("Gece"); filterTags.push("gece"); }
  if (/etkinlik/.test(blob)) { shiftTags.push("Etkinlik"); filterTags.push("etkinlik"); }
  if (/hafta\s*sonu/.test(blob)) { shiftTags.push("Hafta Sonu"); filterTags.push("hafta-sonu"); }
  if (/saat/.test(blob)) { shiftTags.push("12 Saat"); filterTags.push("saatlik"); }
  if (/günlük|gunluk/.test(blob)) { shiftTags.push("Günlük"); filterTags.push("gunluk"); }
  if (shiftTags.length === 0) shiftTags.push("8 Saat", "Vardiyalı");
  return {
    ...w,
    headline: w.description?.split(".")[0]?.trim() || `${w.gender} ÖGG • Müsait`,
    dailyRate: "2.500 TL / Gün",
    shiftTags,
    filterTags,
  };
}

function SafeAvatar({ photoUrl, gender, altName }: { photoUrl?: string | null; gender: string; altName: string }) {
  const [failed, setFailed] = useState(false);
  const isFemale = gender === "Bayan";

  if (!photoUrl || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <User className={`w-8 h-8 ${isFemale ? "text-pink-300" : "text-sky-300"}`} strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <img src={photoUrl} alt={altName} className="w-full h-full object-cover" onError={() => setFailed(true)} />
  );
}

function tagIcon(label: string) {
  if (/gece/i.test(label)) return Moon;
  if (/etkinlik/i.test(label)) return Sparkles;
  if (/hafta/i.test(label)) return CalendarDays;
  return Clock;
}

function PartTimeProfileCard({ w, isAdmin, onFeature, onBan, onDelete, isMine }: {
  w: EnrichedWorker;
  isAdmin?: boolean;
  onFeature?: (id: number) => void;
  onBan?: (id: number, ban: boolean) => void;
  onDelete?: (id: number) => void;
  isMine?: boolean;
}) {
  return (
    <article className="og-pt-profile">
      <button type="button" className="og-pt-profile__bookmark" aria-label="Kaydet">
        <Bookmark className="w-3.5 h-3.5" />
      </button>

      <div className="og-pt-profile__avatar-wrap">
        <div className="og-pt-profile__avatar">
          <SafeAvatar photoUrl={w.photoUrl} gender={w.gender} altName={w.fullName} />
        </div>
        <span className="og-pt-profile__avail">MÜSAİT</span>
      </div>

      <div className="og-pt-profile__main">
        <h3 className="og-pt-profile__title">{w.headline}</h3>
        <div className="og-pt-profile__loc">
          <MapPin />
          <span>{w.city} / {w.district}</span>
        </div>
        <div className="og-pt-profile__rate">{w.dailyRate}</div>
        <div className="og-pt-profile__tags">
          {w.shiftTags.map(tag => {
            const Icon = tagIcon(tag);
            return (
              <span key={tag} className="og-pt-profile__tag">
                <Icon />
                {tag}
              </span>
            );
          })}
        </div>
        {w.description && <p className="og-pt-profile__desc">{w.description}</p>}
      </div>

      <div className="og-pt-profile__actions">
        <a href={`tel:${w.phone}`} className="og-pt-profile__btn og-pt-profile__btn--ghost">
          <Eye />
          Profili Gör
        </a>
        <a href={`tel:${w.phone}`} className="og-pt-profile__btn og-pt-profile__btn--primary">
          <Send />
          İletişim
        </a>
      </div>

      {(isAdmin || isMine) && (
        <div className="og-pt-profile__admin">
          {isAdmin && (
            <>
              <button type="button" onClick={() => onFeature?.(w.id)} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${w.isFeatured ? "bg-amber-400 text-slate-900" : "bg-slate-900 text-amber-400 border border-amber-400/40"}`}>
                {w.isFeatured ? "★ Öne çıkan" : "★ Öne çıkar"}
              </button>
              <button type="button" onClick={() => onBan?.(w.id, !w.isBanned)} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${w.isBanned ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"}`}>
                {w.isBanned ? "Yasağı kaldır" : "Yasakla"}
              </button>
            </>
          )}
          {(isMine || isAdmin) && (
            <button type="button" onClick={() => onDelete?.(w.id)} className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold ml-auto inline-flex items-center gap-1">
              <Trash2 className="w-2.5 h-2.5" /> Sil
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default function PartTime() {
  const { user } = useAuth();
  const { toast } = useToast();
  const profilesRef = useRef<HTMLElement | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"liste" | "basvur">("liste");
  const [myListing, setMyListing] = useState<Worker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    fullName: "", age: "", isRetired: false, gender: "Bay",
    phone: "", city: "", district: "", hasVehicle: "Yok", description: "",
  });

  const isAdmin = user?.role === "admin" || user?.role === "moderator";

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    const wRes = await fetch("/api/parttime").then(r => r.json()).catch(() => []);
    setWorkers(Array.isArray(wRes) ? wRes : []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchWorkers(); }, [fetchWorkers]);

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
        fullName: (user as { fullName?: string; displayName?: string }).fullName
          || (user as { displayName?: string }).displayName || "",
        phone: (user as { phone?: string }).phone || "",
      }));
    }
  }, [myListing, user]);

  const sourceWorkers = workers;

  const enriched = useMemo(() => sourceWorkers.map(enrichWorker), [sourceWorkers]);

  const displayWorkers = useMemo(() => {
    let list = [...enriched];
    if (filter !== "all") {
      list = list.filter(w => w.filterTags.includes(filter));
    }
    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase("tr-TR");
      list = list.filter(w =>
        `${w.headline} ${w.city} ${w.district} ${w.description}`.toLocaleLowerCase("tr-TR").includes(q),
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [enriched, filter, search]);

  const dayAgo = Date.now() - 86_400_000;
  const newToday = displayWorkers.filter(w => new Date(w.createdAt).getTime() > dayAgo).length;
  const statActive = displayWorkers.length;
  const statNew = newToday;
  const statFast = Math.max(12, Math.round(displayWorkers.length * 0.25));

  const handleSubmit = async () => {
    if (!form.fullName || !form.age || !form.phone || !form.city || !form.district) {
      toast({ title: "Zorunlu alanları doldurun", variant: "destructive" });
      return;
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
        throw new Error((err as { error?: string }).error || "İşlem başarısız");
      }
      const data = await res.json();
      setMyListing(data);
      toast({ title: myListing ? "Kaydınız güncellendi" : "Sıraya eklendiniz!" });
      setTab("liste");
      void fetchWorkers();
    } catch (e: unknown) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "İşlem başarısız", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Kaydı silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/parttime/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    if (myListing?.id === id) setMyListing(null);
    void fetchWorkers();
    toast({ title: "Kayıt silindi" });
  };

  const handleFeature = async (id: number) => {
    const res = await fetch(`/api/parttime/${id}/feature`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) { void fetchWorkers(); toast({ title: "Öne çıkarma güncellendi" }); }
  };

  const handleBan = async (id: number, ban: boolean) => {
    const reason = ban ? prompt("Yasaklama sebebi:") || "Kural ihlali" : "";
    const res = await fetch(`/api/parttime/${id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ban, reason }),
    });
    if (res.ok) { void fetchWorkers(); toast({ title: ban ? "Yasaklandı" : "Yasak kaldırıldı" }); }
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
      void fetchWorkers();
      toast({ title: "Fotoğraf güncellendi" });
    }
  };

  const scrollToProfiles = () => {
    profilesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openApply = () => {
    if (!user) {
      window.location.assign("/kayit");
      return;
    }
    setTab("basvur");
  };

  return (
    <Layout headerVariant="parttime">
      <div className="og-parttime-page">

        <div className="og-pt-search">
          <Search className="og-pt-search__ico" aria-hidden />
          <input
            id="og-parttime-search"
            type="search"
            className="og-pt-search__input"
            placeholder="Konum, pozisyon veya saat ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="og-pt-filters">
          {FILTER_PILLS.map(p => (
            <button
              key={p.id}
              type="button"
              className={`og-pt-pill${filter === p.id ? " og-pt-pill--active" : ""}`}
              onClick={() => setFilter(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <section className="og-pt-hero-card">
          <div className="og-pt-hero-badge">
            <Star fill="currentColor" />
            Öne Çıkan
          </div>
          <h2 className="og-pt-hero-title">PartTime Çalışmak İsteyenler</h2>
          <p className="og-pt-hero-desc">
            Müsait olduğun günleri paylaş, firmalar sana kolayca ulaşsın. Saatlik, günlük ve vardiyalı işler için ilan ver.
          </p>
          <div className="og-pt-hero-actions">
            <button type="button" className="og-pt-hero-btn og-pt-hero-btn--primary" onClick={openApply}>
              <Send className="w-3.5 h-3.5" />
              İlan Ver
            </button>
            <button type="button" className="og-pt-hero-btn og-pt-hero-btn--ghost" onClick={scrollToProfiles}>
              <Users className="w-3.5 h-3.5" />
              Profilleri Gör
            </button>
          </div>
          <div className="og-pt-hero-art" aria-hidden>
            <div className="og-pt-hero-art-inner">
              <ClipboardList className="og-pt-art-clipboard" />
              <Clock className="og-pt-art-clock" />
              <ShieldCheck className="og-pt-art-shield" />
              <span className="og-pt-art-card">PARTTIME</span>
            </div>
          </div>
        </section>

        <section className="og-pt-stats" aria-label="PartTime istatistikleri">
          <div className="og-pt-stat">
            <div className="og-pt-stat__ico"><Users /></div>
            <div className="og-pt-stat__val">{statActive}</div>
            <div className="og-pt-stat__lbl">Aktif Profil</div>
          </div>
          <div className="og-pt-stat">
            <div className="og-pt-stat__ico"><Star /></div>
            <div className="og-pt-stat__val">{statNew}</div>
            <div className="og-pt-stat__lbl">Yeni Bugün</div>
          </div>
          <div className="og-pt-stat">
            <div className="og-pt-stat__ico"><Clock /></div>
            <div className="og-pt-stat__val">{statFast}</div>
            <div className="og-pt-stat__lbl">Saatte Hızlı Dönüş</div>
          </div>
        </section>

        <AnimatePresence>
          {tab === "basvur" && user && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="og-pt-form-panel space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-amber-400">{myListing ? "Kaydımı Düzenle" : "PartTime İlanı Ver"}</h2>
                  <button type="button" onClick={() => setTab("liste")} className="og-icon-btn p-1"><X className="w-4 h-4" /></button>
                </div>

                {myListing && (
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-amber-400/30">
                      <SafeAvatar photoUrl={myListing.photoUrl} gender={myListing.gender} altName={myListing.fullName} />
                    </div>
                    <div>
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); }} />
                      <Button size="sm" variant="outline" className="border-white/10 text-xs gap-1.5" onClick={() => photoInputRef.current?.click()}>
                        <Camera className="w-3.5 h-3.5" />Fotoğraf
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Ad Soyad *</label>
                    <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Ahmet Yılmaz" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Yaş *</label>
                    <Input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="35" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Cinsiyet</label>
                    <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none">
                      <option>Bay</option><option>Bayan</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Telefon *</label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0555 555 55 55" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">İl *</label>
                    <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none">
                      <option value="">Seçin</option>
                      {ILLER.map(il => <option key={il}>{il}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">İlçe *</label>
                    <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="İlçe" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Açıklama</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Deneyim, müsait günler, ücret beklentisi..."
                      rows={3}
                      maxLength={300}
                      className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                    />
                  </div>
                </div>

                <Button onClick={() => void handleSubmit()} disabled={submitting} className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  {myListing ? "Güncelle" : "İlan Ver"}
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <section ref={profilesRef}>
          <div className="og-pt-section-head">
            <h2 className="og-pt-section-title">Müsait Profiller</h2>
            <button type="button" className="og-pt-section-link" onClick={scrollToProfiles}>Tümünü Gör &gt;</button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="og-list-skeleton" style={{ minHeight: 120 }} />)}
            </div>
          ) : displayWorkers.length === 0 ? (
            <div className="og-lp-empty text-center py-8 text-slate-400 text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Henüz profil yok — ilk siz olun!</p>
              {!user && (
                <Link href="/kayit" className="text-amber-400 text-xs mt-2 inline-block">Kayıt Ol</Link>
              )}
            </div>
          ) : (
            displayWorkers.map(w => (
              <PartTimeProfileCard
                key={w.id}
                w={w}
                isAdmin={isAdmin}
                onFeature={handleFeature}
                onBan={handleBan}
                onDelete={handleDelete}
                isMine={w.userId === user?.id}
              />
            ))
          )}
        </section>

        <div className="og-pt-support">
          <LiveSupportBar
            className="og-pt-support"
            title="Yardıma mı ihtiyacın var?"
            description="Destek ekibimiz 7/24 yanınızda."
          />
        </div>
      </div>
    </Layout>
  );
}
