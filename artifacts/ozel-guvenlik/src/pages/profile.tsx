import React, { useEffect, useRef, useState } from "react";
import {
  useGetUserProfile, useGetListings, useLogout, getGetUserProfileQueryKey,
  useGetMyFavorites, getGetMyFavoritesQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useParams, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  LogOut, MapPin, Camera, Loader2, Pencil, Check, X, KeyRound, RefreshCw,
  Clock, UserCircle, Crown, Trash2, Power, Edit2, ShieldCheck, Heart, Bell,
  Calendar, ChevronRight, Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { displayCompany } from "@/lib/utils";
import { getListingImage } from "@/lib/listing-image";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

function apiCall(path: string, method: string, body?: unknown) {
  return fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (h < 1) return "Az önce";
  if (h < 24) return `${h} saat önce`;
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function detectArmed(title?: string | null, desc?: string | null, req?: string | null): string {
  const haystack = `${title ?? ""} ${desc ?? ""} ${req ?? ""}`.toLocaleLowerCase("tr-TR");
  const isArmed = /silahl[ıi]/.test(haystack);
  const isUnarmed = /silahs[ıi]z/.test(haystack);
  if (isArmed && !isUnarmed) return "Silahlı Görev";
  return "Silahsız Görev";
}

const CARD_THEME_OPTIONS = [
  { value: "auto", label: "Otomatik" },
  { value: "urgent", label: "Acil / Kırmızı" },
  { value: "gold", label: "Gold" },
  { value: "radar", label: "Radar / Mavi" },
  { value: "vip", label: "VIP / Mor" },
  { value: "night", label: "Gece / Mor" },
  { value: "map", label: "Harita / Yeşil" },
  { value: "tactical", label: "Taktik / Yeşil" },
  { value: "holo", label: "Hologram" },
  { value: "light", label: "Beyaz Premium" },
] as const;

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const isMe = user?.username === username;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [showPersonal, setShowPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ fullName: "", phone: "", birthDate: "", height: "", weight: "", address: "", maritalStatus: "Bekar" });
  const [personalLoading, setPersonalLoading] = useState(false);

  const [showPwChange, setShowPwChange] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  // Notification settings
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    likes: true,
    replies: true,
    listings: true,
    support: true,
  });
  const [notifLoading, setNotifLoading] = useState(false);

  const { data: profile, isLoading } = useGetUserProfile(username || "", {
    query: {
      enabled: !!username,
      queryKey: getGetUserProfileQueryKey(username || ""),
    },
  });

  // Load saved notification prefs from localStorage
  useEffect(() => {
    if (!isMe) return;
    try {
      const raw = localStorage.getItem("notif_prefs");
      if (raw) setNotifPrefs(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
  }, [isMe]);

  const saveNotifPrefs = () => {
    setNotifLoading(true);
    try {
      localStorage.setItem("notif_prefs", JSON.stringify(notifPrefs));
      toast({ title: "Bildirim tercihleri kaydedildi" });
      setShowNotifSettings(false);
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    } finally {
      setNotifLoading(false);
    }
  };

  const { data: listingsData } = useGetListings({ page: 1, limit: 50 });
  const userListings = listingsData?.listings?.filter(l => l.authorUsername === username) || [];
  const [myListings, setMyListings] = useState<any[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const [republishingId, setRepublishingId] = useState<number | null>(null);
  const [themeUpdatingId, setThemeUpdatingId] = useState<number | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Favorites count
  const { data: favData } = useGetMyFavorites({
    query: { queryKey: getGetMyFavoritesQueryKey(), enabled: !!user && isMe },
  });
  const favCount = Array.isArray(favData) ? favData.length : 0;

  useEffect(() => {
    if (!isMe) return;
    setMyListingsLoading(true);
    fetch("/api/listings/mine", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: any[]) => setMyListings(Array.isArray(data) ? data : []))
      .catch(() => setMyListings([]))
      .finally(() => setMyListingsLoading(false));
  }, [isMe]);

  const handleRepublish = async (listingId: number) => {
    setRepublishingId(listingId);
    try {
      const res = await fetch(`/api/listings/${listingId}/republish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setMyListings(prev => prev.map((l: any) => l.id === listingId ? updated : l));
      toast({ title: "İlan yeniden yayınlandı", description: "1 ay daha yayında kalacak." });
    } catch {
      toast({ title: "Hata", description: "İlan yeniden yayınlanamadı.", variant: "destructive" });
    } finally {
      setRepublishingId(null);
    }
  };

  const updateListingTheme = async (listingId: number, cardTheme: string) => {
    setThemeUpdatingId(listingId);
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ cardTheme: cardTheme !== "auto" ? cardTheme : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || "Kart rengi değiştirilemedi");
      setMyListings(prev => prev.map((l: any) => l.id === listingId ? { ...l, cardTheme: data.cardTheme } : l));
      toast({ title: "Kart rengi güncellendi" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setThemeUpdatingId(null);
    }
  };

  const updateOwnListing = async (listingId: number, payload: Record<string, unknown>) => {
    setActionLoadingId(listingId);
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || "İlan güncellenemedi");
      setMyListings(prev => prev.map((l: any) => l.id === listingId ? data : l));
      toast({ title: "İlan güncellendi" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const quickEditListing = async (listing: any) => {
    const title = window.prompt("İlan başlığı", listing.title);
    if (title === null) return;
    const city = window.prompt("İl / İlçe / Semt", listing.city);
    if (city === null) return;
    const salary = window.prompt("Maaş / Yan Haklar", listing.salary ?? "");
    if (salary === null) return;
    const applyUrl = window.prompt("Telefon / Başvuru linki", listing.applyUrl ?? "");
    if (applyUrl === null) return;
    const description = window.prompt("Açıklama", listing.description ?? "");
    if (description === null) return;
    await updateOwnListing(listing.id, { title, city, salary, applyUrl, description });
  };

  const toggleListingStatus = async (listing: any) => {
    await updateOwnListing(listing.id, { status: listing.status === "active" ? "inactive" : "active" });
  };

  const deleteOwnListing = async (listingId: number) => {
    if (!window.confirm(`#${listingId} numaralı ilan silinsin mi?`)) return;
    setActionLoadingId(listingId);
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("İlan silinemedi");
      setMyListings(prev => prev.filter((l: any) => l.id !== listingId));
      toast({ title: "İlan silindi" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogout = () => {
    try { void logoutMutation.mutateAsync(); } catch { /* stateless JWT */ }
    localStorage.removeItem("auth_token");
    queryClient.clear();
    toast({ title: "Çıkış yapıldı" });
    window.location.href = "/";
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/users/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Yükleme başarısız");
      }
      await queryClient.invalidateQueries();
      toast({ title: "Profil resmi güncellendi" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
      setAvatarPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEditName = () => {
    setNameInput((profile as any)?.displayName || "");
    setEditingName(true);
  };

  const saveName = async () => {
    try {
      const res = await apiCall("/users/me", "PATCH", { displayName: nameInput.trim() || null });
      if (!res.ok) throw new Error("Güncelleme başarısız");
      await queryClient.invalidateQueries();
      setEditingName(false);
      toast({ title: "Adınız güncellendi" });
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    }
  };

  const openPersonal = () => {
    const p = profile as any;
    setPersonalForm({
      fullName:      p?.fullName      || "",
      phone:         p?.phone         || "",
      birthDate:     p?.birthDate     || "",
      height:        p?.height        || "",
      weight:        p?.weight        || "",
      address:       p?.address       || "",
      maritalStatus: p?.maritalStatus || "Bekar",
    });
    setShowPersonal(v => !v);
  };

  const savePersonal = async () => {
    setPersonalLoading(true);
    try {
      const res = await apiCall("/users/me", "PATCH", {
        fullName:      personalForm.fullName.trim()      || null,
        phone:         personalForm.phone.trim()         || null,
        birthDate:     personalForm.birthDate.trim()     || null,
        height:        personalForm.height.trim()        || null,
        weight:        personalForm.weight.trim()        || null,
        address:       personalForm.address.trim()       || null,
        maritalStatus: personalForm.maritalStatus.trim() || null,
      });
      if (!res.ok) throw new Error("Güncelleme başarısız");
      await queryClient.invalidateQueries();
      toast({ title: "Kişisel bilgiler kaydedildi" });
      setShowPersonal(false);
    } catch {
      toast({ title: "Hata", variant: "destructive" });
    } finally {
      setPersonalLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      toast({ title: "Tüm alanları doldurun", variant: "destructive" }); return;
    }
    if (pwForm.next !== pwForm.confirm) {
      toast({ title: "Yeni şifreler eşleşmiyor", variant: "destructive" }); return;
    }
    if (pwForm.next.length < 6) {
      toast({ title: "Şifre en az 6 karakter olmalıdır", variant: "destructive" }); return;
    }
    setPwLoading(true);
    try {
      const res = await apiCall("/auth/change-password", "POST", {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || "Şifre değiştirilemedi");
      toast({ title: "Şifre güncellendi" });
      setShowPwChange(false);
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setPwLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 flex justify-center mt-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="p-4 text-center mt-20 og-text-muted">Kullanıcı bulunamadı.</div>
      </Layout>
    );
  }

  const displayAvatar = avatarPreview ?? (profile.avatarUrl || undefined);
  const profileDisplayName = (profile as any).displayName as string | null;
  const initials = profile.username.substring(0, 2).toUpperCase();
  const totalListings = isMe ? myListings.length : (profile as any).listingCount ?? userListings.length ?? 0;
  const myShownListings = (isMe ? myListings : userListings).slice(0, 5);
  const joinDate = new Date(profile.createdAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <Layout>
      <div className="p-4 space-y-4">

        {/* ── Profile Card ─────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="og-profile-card"
        >
          {isMe && (
            <button
              onClick={handleLogout}
              className="og-icon-btn p-2 absolute top-3 right-3 z-10 text-rose-400 hover:bg-rose-500/10"
              aria-label="Çıkış yap"
              title="Çıkış yap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          <div className="og-profile-avatar-wrap">
            <div className="og-profile-avatar-inner">
              {displayAvatar ? (
                <img src={displayAvatar} alt={profile.username} className="w-full h-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            {isMe && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    user?.role === "admin" || user?.role === "moderator"
                      ? "image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      : "image/jpeg,image/jpg,image/png,image/webp"
                  }
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="og-profile-cam-btn"
                  title="Profil resmi değiştir"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </button>
              </>
            )}
          </div>

          {/* Display name + edit pencil */}
          <div className="text-center">
            {isMe && editingName ? (
              <div className="flex items-center gap-2 justify-center">
                <Input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Adınız (sohbette görünür)"
                  className="h-9 text-base font-bold border-amber-400/40 text-center max-w-[220px] bg-white/5"
                  maxLength={32}
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                />
                <button onClick={saveName} className="text-emerald-400 hover:text-emerald-300"><Check className="w-5 h-5" /></button>
                <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 justify-center">
                <h1
                  className={`text-2xl font-black tracking-tight ${profile.nameAnimated ? "animate-rainbow" : ""}`}
                  style={profile.nameColor && !profile.nameAnimated ? { color: profile.nameColor } : { color: "var(--foreground)" }}
                >
                  {profileDisplayName || profile.username}
                </h1>
                {isMe && (
                  <button onClick={startEditName} className="og-icon-btn p-1 text-amber-400 hover:bg-amber-500/10" title="Adı düzenle">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs og-text-muted mt-0.5">@{profile.username}</p>

            {/* Pills row */}
            <div className="flex items-center justify-center gap-2 flex-wrap mt-3">
              {profile.role === "admin" ? (
                <span className="og-profile-pill og-profile-pill-gold">
                  <Crown className="w-3 h-3 fill-current" /> Yönetici
                </span>
              ) : profile.role === "moderator" ? (
                <span className="og-profile-pill og-profile-pill-gold">
                  <ShieldCheck className="w-3 h-3" /> Moderatör
                </span>
              ) : null}
              {(profile as any).isVip && (
                <span className="og-profile-pill og-profile-pill-gold">
                  <Crown className="w-3 h-3 fill-current" /> VIP
                </span>
              )}
              <span className="og-profile-pill">
                <Calendar className="w-3 h-3" /> Katılım: {joinDate}
              </span>
            </div>

            {profile.bio && <p className="text-sm px-2 mt-3 og-text-muted">{profile.bio}</p>}

            {isMe && (
              <p className="text-[11px] og-text-muted mt-3 max-w-xs mx-auto">
                Kalem ikonuna tıklayarak sohbette görünecek adınızı değiştirebilirsiniz.
              </p>
            )}
          </div>
        </motion.section>

        {/* ── Stats Row ────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-2.5">
          <div className="og-stat-card">
            <div className="og-stat-icon"><ShieldCheck className="w-4 h-4" /></div>
            <div className="og-stat-value">{totalListings}</div>
            <div className="og-stat-label">İlan</div>
          </div>
          {isMe ? (
            <Link href="/favoriler" className="og-stat-card block">
              <div className="og-stat-icon"><Heart className="w-4 h-4" /></div>
              <div className="og-stat-value">{favCount}</div>
              <div className="og-stat-label">Favoriler</div>
            </Link>
          ) : (
            <div className="og-stat-card">
              <div className="og-stat-icon"><Star className="w-4 h-4" /></div>
              <div className="og-stat-value">{(profile as any).isVip ? "VIP" : "—"}</div>
              <div className="og-stat-label">Üyelik</div>
            </div>
          )}
        </section>

        {/* ── Settings list (only when isMe) ───────────────── */}
        {isMe && (
          <section className="space-y-2.5">
            {/* Kişisel bilgiler */}
            <button onClick={openPersonal} className="og-setting-row">
              <div className="og-setting-icon"><UserCircle className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0 text-left">
                <div className="og-setting-title">Kişisel Bilgiler</div>
                <div className="og-setting-sub">Profil bilgilerini görüntüle ve düzenle</div>
              </div>
              <ChevronRight className={`w-4 h-4 og-text-muted transition-transform ${showPersonal ? "rotate-90" : ""}`} />
            </button>
            <AnimatePresence>
              {showPersonal && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="og-setting-row flex-col items-stretch gap-3 p-4">
                    <p className="text-[11px] og-text-muted">Bu bilgiler CV oluşturucuya otomatik aktarılır. Sohbet adınız bu alandan bağımsızdır.</p>
                    <div>
                      <label className="block text-xs og-text-muted mb-1">Ad Soyad (CV için)</label>
                      <Input value={personalForm.fullName} onChange={e => setPersonalForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Adınız Soyadınız" maxLength={64} />
                    </div>
                    <div>
                      <label className="block text-xs og-text-muted mb-1">Telefon</label>
                      <Input value={personalForm.phone} onChange={e => setPersonalForm(f => ({ ...f, phone: e.target.value }))} placeholder="0555 555 55 55" maxLength={20} />
                    </div>
                    <div>
                      <label className="block text-xs og-text-muted mb-1">Doğum Tarihi</label>
                      <Input value={personalForm.birthDate} onChange={e => setPersonalForm(f => ({ ...f, birthDate: e.target.value }))} placeholder="10.09.1990" maxLength={20} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs og-text-muted mb-1">Boy (cm)</label>
                        <Input value={personalForm.height} onChange={e => setPersonalForm(f => ({ ...f, height: e.target.value }))} placeholder="175" maxLength={6} />
                      </div>
                      <div>
                        <label className="block text-xs og-text-muted mb-1">Kilo (kg)</label>
                        <Input value={personalForm.weight} onChange={e => setPersonalForm(f => ({ ...f, weight: e.target.value }))} placeholder="80" maxLength={6} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs og-text-muted mb-1">Medeni Durum</label>
                      <select value={personalForm.maritalStatus} onChange={e => setPersonalForm(f => ({ ...f, maritalStatus: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-400/50">
                        {["Bekar", "Evli", "Boşanmış"].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs og-text-muted mb-1">Adres</label>
                      <Input value={personalForm.address} onChange={e => setPersonalForm(f => ({ ...f, address: e.target.value }))} placeholder="Mahalle, İlçe / Şehir" maxLength={120} />
                    </div>
                    <Button onClick={savePersonal} disabled={personalLoading} className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold">
                      {personalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Kaydet
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Şifre değiştir */}
            <button onClick={() => setShowPwChange(v => !v)} className="og-setting-row">
              <div className="og-setting-icon"><KeyRound className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0 text-left">
                <div className="og-setting-title">Şifre Değiştir</div>
                <div className="og-setting-sub">Hesap şifrenizi güncelleyin</div>
              </div>
              <ChevronRight className={`w-4 h-4 og-text-muted transition-transform ${showPwChange ? "rotate-90" : ""}`} />
            </button>
            <AnimatePresence>
              {showPwChange && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="og-setting-row flex-col items-stretch gap-3 p-4">
                    <Input
                      type="password"
                      placeholder="Mevcut şifre"
                      value={pwForm.current}
                      onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    />
                    <Input
                      type="password"
                      placeholder="Yeni şifre (en az 6 karakter)"
                      value={pwForm.next}
                      onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                    />
                    <Input
                      type="password"
                      placeholder="Yeni şifre tekrar"
                      value={pwForm.confirm}
                      onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    />
                    <Button
                      onClick={handlePasswordChange}
                      disabled={pwLoading}
                      className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold"
                    >
                      {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Şifreyi Güncelle
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bildirim ayarları */}
            <button onClick={() => setShowNotifSettings(v => !v)} className="og-setting-row">
              <div className="og-setting-icon"><Bell className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0 text-left">
                <div className="og-setting-title">Bildirim Ayarları</div>
                <div className="og-setting-sub">Bildirim tercihlerinizi yönetin</div>
              </div>
              <ChevronRight className={`w-4 h-4 og-text-muted transition-transform ${showNotifSettings ? "rotate-90" : ""}`} />
            </button>
            <AnimatePresence>
              {showNotifSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="og-setting-row flex-col items-stretch gap-2 p-4">
                    {[
                      { key: "likes" as const, label: "Beğeni bildirimleri" },
                      { key: "replies" as const, label: "Yanıt / sohbet bildirimleri" },
                      { key: "listings" as const, label: "Yeni ilan bildirimleri" },
                      { key: "support" as const, label: "Destek bildirimleri" },
                    ].map(item => (
                      <label key={item.key} className="flex items-center justify-between py-2 cursor-pointer">
                        <span className="text-sm">{item.label}</span>
                        <input
                          type="checkbox"
                          checked={notifPrefs[item.key]}
                          onChange={e => setNotifPrefs(p => ({ ...p, [item.key]: e.target.checked }))}
                          className="w-4 h-4 accent-amber-400"
                        />
                      </label>
                    ))}
                    <Button
                      onClick={saveNotifPrefs}
                      disabled={notifLoading}
                      className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-bold mt-2"
                    >
                      {notifLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Kaydet
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* ── Senin İlanların ──────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="og-section-title">{isMe ? "Senin İlanların" : "İlanları"}</h2>
            <div className="flex items-center gap-2">
              {isMe && myListings.length > 0 && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`${myListings.length} ilanınızı kalıcı olarak silmek istediğinize emin misiniz?`)) return;
                    setMyListingsLoading(true);
                    try {
                      const token = getToken();
                      const ids = myListings.map((l: any) => l.id);
                      const results = await Promise.allSettled(
                        ids.map((id: number) =>
                          fetch(`/api/listings/${id}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${token}` },
                          })
                        )
                      );
                      const deleted = results.filter(r => r.status === "fulfilled" && (r.value as Response).ok).length;
                      setMyListings([]);
                      toast({ title: `${deleted} ilan silindi` });
                    } catch {
                      toast({ title: "Silme işlemi başarısız", variant: "destructive" });
                    } finally {
                      setMyListingsLoading(false);
                    }
                  }}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 inline-flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" /> Tümünü Sil
                </button>
              )}
              <Link
                href={`/ilanlar?author=${profile.username}`}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"
              >
                Tümünü Gör <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="space-y-2.5">
            {isMe && myListingsLoading ? (
              [1, 2, 3].map(i => <div key={i} className="og-list-skeleton" />)
            ) : myShownListings.length === 0 ? (
              <div className="og-empty">
                <ShieldCheck className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-semibold">İlan bulunmuyor</p>
              </div>
            ) : (
              myShownListings.map((listing: any, i: number) => {
                const company = displayCompany(listing.company) || "Firma";
                const initials2 = company.split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "G";
                const isExpired = listing.status === "expired";
                const isActive = listing.status === "active";
                const daysLeft = listing.expiresAt
                  ? Math.ceil((new Date(listing.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const armedLabel = detectArmed(listing.title, listing.description, listing.requirements);
                const img = getListingImage(listing.title, listing.company, listing.companyLogoUrl, listing.id);
                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.2) }}
                    className={`og-list-row-wrap ${isExpired ? "opacity-70" : ""}`}
                  >
                    <Link href={`/ilan/${listing.id}`} className="og-list-row">
                      <div className="og-list-img">
                        {listing.companyLogoUrl ? (
                          <img src={listing.companyLogoUrl} alt={company} className="w-full h-full object-cover" />
                        ) : img ? (
                          <img src={img} alt={listing.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-base font-black text-slate-900 bg-gradient-to-br from-amber-300 to-amber-500">
                            {initials2}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`og-status ${
                            isActive ? "og-status-new" : isExpired ? "og-status-urgent" : "og-status-featured"
                          }`}>
                            {isActive ? "Yayında" : isExpired ? "Süresi Doldu" : "Bekliyor"}
                          </span>
                          {isActive && daysLeft !== null && daysLeft <= 3 && daysLeft > 0 && (
                            <span className="og-status og-status-urgent">
                              <Clock className="w-2.5 h-2.5" /> {daysLeft}g
                            </span>
                          )}
                        </div>

                        <h3 className="og-list-title">{listing.title}</h3>

                        <div className="flex items-center gap-1 text-[11px] og-text-muted mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{listing.city}</span>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="og-mini-chip">{listing.workType || "Tam Zamanlı"}</span>
                          <span className="og-mini-chip">{armedLabel}</span>
                        </div>

                        <div className="og-list-foot">
                          <span className="og-text-muted text-[10px] truncate">
                            {company} · {formatDate(listing.createdAt)}
                          </span>
                          <span className="og-mini-chip" style={{ background: "linear-gradient(135deg,#facc15,#f59e0b)", color: "#1e1b0a", borderColor: "transparent" }}>
                            İlan Gör <ChevronRight className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </div>

                      <div className="og-list-salary text-right shrink-0">
                        <div className="og-list-salary-amount">{listing.salary || "—"}</div>
                        <div className="og-text-muted text-[10px] font-semibold">Aylık</div>
                      </div>
                    </Link>

                    {isMe && (
                      <div className="mt-2 grid grid-cols-3 gap-2 px-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/10 text-xs"
                          disabled={actionLoadingId === listing.id}
                          onClick={() => quickEditListing(listing)}
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" /> Düzenle
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/10 text-xs"
                          disabled={actionLoadingId === listing.id}
                          onClick={() => toggleListingStatus(listing)}
                        >
                          <Power className="w-3.5 h-3.5 mr-1" /> {listing.status === "active" ? "Pasif" : "Yayınla"}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-destructive/90 hover:bg-destructive text-white text-xs"
                          disabled={actionLoadingId === listing.id}
                          onClick={() => deleteOwnListing(listing.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Sil
                        </Button>
                      </div>
                    )}

                    {isMe && (
                      <div className="mt-2 px-1">
                        <label className="text-[10px] font-bold text-amber-300 mb-1 flex items-center gap-1">
                          <Crown className="w-3 h-3 fill-amber-300" /> Kart Rengi
                        </label>
                        <select
                          value={listing.cardTheme ?? "auto"}
                          onChange={e => updateListingTheme(listing.id, e.target.value)}
                          disabled={themeUpdatingId === listing.id}
                          className="w-full bg-[#111827] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-300/60 disabled:opacity-50"
                        >
                          {CARD_THEME_OPTIONS.map(option => (
                            <option key={option.value} value={option.value} className="bg-[#111827] text-white">{option.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {isMe && isExpired && (
                      <div className="mt-2 px-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-amber-400/40 text-amber-400 hover:bg-amber-400/10 text-xs"
                          disabled={republishingId === listing.id}
                          onClick={() => handleRepublish(listing.id)}
                        >
                          {republishingId === listing.id ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Tekrar Yayınla
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
