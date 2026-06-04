import React, { useEffect, useRef, useState } from "react";
import { useGetUserProfile, useGetListings, useLogout, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, MapPin, Briefcase, Camera, Loader2, Pencil, Check, X, KeyRound, RefreshCw, Clock, UserCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { displayCompany } from "@/lib/utils";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

function apiCall(path: string, method: string, body?: unknown) {
  return fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const isMe = user?.username === username;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Display name edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Kişisel bilgiler state
  const [showPersonal, setShowPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ fullName: "", phone: "", birthDate: "", height: "", weight: "", address: "", maritalStatus: "Bekar" });
  const [personalLoading, setPersonalLoading] = useState(false);

  // Password change state
  const [showPwChange, setShowPwChange] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  const { data: profile, isLoading } = useGetUserProfile(username || "", {
    query: {
      enabled: !!username,
      queryKey: getGetUserProfileQueryKey(username || ""),
    },
  });

  const { data: listingsData } = useGetListings({ page: 1, limit: 50 });
  const userListings = listingsData?.listings?.filter(l => l.authorUsername === username) || [];
  const [myListings, setMyListings] = useState<any[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const [republishingId, setRepublishingId] = useState<number | null>(null);

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
      toast({ title: "İlan yeniden yayınlandı", description: "7 gün daha yayında kalacak." });
    } catch {
      toast({ title: "Hata", description: "İlan yeniden yayınlanamadı.", variant: "destructive" });
    } finally {
      setRepublishingId(null);
    }
  };

  const handleLogout = () => {
    try { void logoutMutation.mutateAsync(); } catch { /* stateless JWT — ignore */ }
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="p-4 text-center mt-20">Kullanıcı bulunamadı.</div>
      </Layout>
    );
  }

  const displayAvatar = avatarPreview ?? (profile.avatarUrl || undefined);
  const profileDisplayName = (profile as any).displayName as string | null;

  return (
    <Layout>
      <div className="p-4 space-y-6">
        {/* Profile card */}
        <div className="glass-card p-6 rounded-3xl relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

          {isMe && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="absolute top-4 right-4 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          )}

          {/* Avatar */}
          <div className="relative mb-4">
            <Avatar className="w-24 h-24 ring-4 ring-background shadow-xl">
              <AvatarImage src={displayAvatar} />
              <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-secondary">
                {profile.username.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
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
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-background transition-all hover:scale-110 active:scale-95"
                  style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}
                  title="Profil resmi değiştir"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
                </button>
              </>
            )}
          </div>

          {/* Display name (nickname) */}
          {isMe ? (
            <div className="mb-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    placeholder="Adınız (sohbette görünür)"
                    className="h-8 text-base font-bold glass-card border-primary/40 text-center w-44"
                    maxLength={32}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  />
                  <button onClick={saveName} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 justify-center">
                  <h1
                    className={`text-2xl font-bold ${profile.nameAnimated ? "animate-rainbow" : ""}`}
                    style={profile.nameColor && !profile.nameAnimated ? { color: profile.nameColor } : {}}
                  >
                    {profileDisplayName || profile.username}
                  </h1>
                  <button onClick={startEditName} className="text-muted-foreground hover:text-foreground mt-0.5" title="Adı düzenle">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {profileDisplayName && (
                <p className="text-xs text-muted-foreground">@{profile.username}</p>
              )}
            </div>
          ) : (
            <div className="mb-1">
              <h1
                className={`text-2xl font-bold ${profile.nameAnimated ? "animate-rainbow" : ""}`}
                style={profile.nameColor && !profile.nameAnimated ? { color: profile.nameColor } : {}}
              >
                {profileDisplayName || profile.username}
              </h1>
              {profileDisplayName && <p className="text-xs text-muted-foreground">@{profile.username}</p>}
            </div>
          )}

          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-4">
            <span className="capitalize">
              {profile.role === "admin" ? "Yönetici" : profile.role === "moderator" ? "Moderatör" : "Üye"}
            </span>
            <span>•</span>
            <span>Katılım: {new Date(profile.createdAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</span>
          </div>

          {profile.bio && <p className="text-sm px-4 text-foreground/80">{profile.bio}</p>}

          {isMe && (
            <p className="text-[11px] text-white/30 mt-1">Kalem ikonuna tıklayarak sohbette görünecek adınızı değiştirebilirsiniz</p>
          )}

          <div className="mt-6 flex space-x-6 text-center">
            <div>
              <div className="font-bold text-xl">{profile.listingCount || 0}</div>
              <div className="text-xs text-muted-foreground">İlan</div>
            </div>
            {isMe && (
              <div>
                <Link href="/favoriler">
                  <div className="font-bold text-xl text-accent">Favoriler</div>
                  <div className="text-xs text-muted-foreground">Görüntüle</div>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Kişisel Bilgiler (only for logged-in user) */}
        {isMe && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              onClick={openPersonal}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <UserCircle className="w-4 h-4 text-cyan-400" />
                Kişisel Bilgiler
              </div>
              <span className="text-muted-foreground text-xs">{showPersonal ? "Kapat" : "Düzenle"}</span>
            </button>
            <AnimatePresence>
              {showPersonal && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 border-t border-white/5 pt-4 space-y-3 overflow-hidden"
                >
                  <p className="text-[11px] text-muted-foreground">Bu bilgiler CV oluşturucuya otomatik aktarılır. Sohbet adınız bu alandan bağımsızdır.</p>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Ad Soyad (CV için)</label>
                    <Input value={personalForm.fullName} onChange={e => setPersonalForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Adınız Soyadınız" className="glass-card border-white/10" maxLength={64} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Telefon</label>
                    <Input value={personalForm.phone} onChange={e => setPersonalForm(f => ({ ...f, phone: e.target.value }))} placeholder="0555 555 55 55" className="glass-card border-white/10" maxLength={20} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Doğum Tarihi</label>
                    <Input value={personalForm.birthDate} onChange={e => setPersonalForm(f => ({ ...f, birthDate: e.target.value }))} placeholder="10.09.1990" className="glass-card border-white/10" maxLength={20} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Boy (cm)</label>
                      <Input value={personalForm.height} onChange={e => setPersonalForm(f => ({ ...f, height: e.target.value }))} placeholder="175" className="glass-card border-white/10" maxLength={6} />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Kilo (kg)</label>
                      <Input value={personalForm.weight} onChange={e => setPersonalForm(f => ({ ...f, weight: e.target.value }))} placeholder="80" className="glass-card border-white/10" maxLength={6} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Medeni Durum</label>
                    <select value={personalForm.maritalStatus} onChange={e => setPersonalForm(f => ({ ...f, maritalStatus: e.target.value }))} className="w-full bg-card border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                      {["Bekar", "Evli", "Boşanmış"].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Adres</label>
                    <Input value={personalForm.address} onChange={e => setPersonalForm(f => ({ ...f, address: e.target.value }))} placeholder="Mahalle, İlçe / Şehir" className="glass-card border-white/10" maxLength={120} />
                  </div>
                  <Button onClick={savePersonal} disabled={personalLoading} className="w-full bg-gradient-to-r from-cyan-600 to-primary text-white">
                    {personalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Kaydet
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Password change section (only for logged-in user) */}
        {isMe && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowPwChange(v => !v)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <KeyRound className="w-4 h-4 text-primary" />
                Şifre Değiştir
              </div>
              <span className="text-muted-foreground text-xs">{showPwChange ? "Kapat" : "Aç"}</span>
            </button>
            <AnimatePresence>
              {showPwChange && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 border-t border-white/5 pt-4 space-y-3 overflow-hidden"
                >
                  <Input
                    type="password"
                    placeholder="Mevcut şifre"
                    value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    className="glass-card border-white/10"
                  />
                  <Input
                    type="password"
                    placeholder="Yeni şifre (en az 6 karakter)"
                    value={pwForm.next}
                    onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                    className="glass-card border-white/10"
                  />
                  <Input
                    type="password"
                    placeholder="Yeni şifre tekrar"
                    value={pwForm.confirm}
                    onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    className="glass-card border-white/10"
                  />
                  <Button
                    onClick={handlePasswordChange}
                    disabled={pwLoading}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white"
                  >
                    {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Şifreyi Güncelle
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Listings */}
        <div>
          <h2 className="text-lg font-bold mb-4">{isMe ? "Senin İlanların" : "İlanları"}</h2>
          <div className="space-y-4">
            {isMe && myListingsLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (isMe ? myListings : userListings).length === 0 ? (
              <div className="text-center p-8 glass-card rounded-2xl text-muted-foreground">
                İlan bulunmuyor.
              </div>
            ) : (
              (isMe ? myListings : userListings).map((listing: any, i: number) => {
                const isExpired = listing.status === "expired";
                const isActive = listing.status === "active";
                const daysLeft = listing.expiresAt
                  ? Math.ceil((new Date(listing.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={listing.id}
                    className={`glass-card rounded-2xl p-4 relative ${isExpired ? "opacity-70" : ""}`}
                  >
                    <Link href={`/ilan/${listing.id}`} className="block">
                      <h3 className="font-semibold text-base mb-1 line-clamp-1">{listing.title}</h3>
                      {displayCompany(listing.company) && (
                        <p className="text-sm text-muted-foreground mb-3">{displayCompany(listing.company)}</p>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex space-x-3 text-muted-foreground">
                          <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" />{listing.city}</span>
                          <span className="flex items-center"><Briefcase className="w-3.5 h-3.5 mr-1" />{listing.workType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isActive && daysLeft !== null && daysLeft <= 3 && daysLeft > 0 && (
                            <span className="flex items-center text-orange-400">
                              <Clock className="w-3 h-3 mr-1" />{daysLeft}g kaldı
                            </span>
                          )}
                          <span className={`px-2 py-1 rounded font-medium ${
                            isActive ? "bg-green-500/20 text-green-400" :
                            isExpired ? "bg-red-500/20 text-red-400" :
                            "bg-yellow-500/20 text-yellow-400"
                          }`}>
                            {isActive ? "Yayında" : isExpired ? "Süresi Doldu" : "Bekliyor"}
                          </span>
                        </div>
                      </div>
                    </Link>
                    {isMe && isExpired && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-primary/40 text-primary hover:bg-primary/10 text-xs"
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
        </div>
      </div>
    </Layout>
  );
}
