import React, { useState, useEffect } from "react";
import { useGetListing, useToggleListingLike, useToggleListingFavorite, getGetListingQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useParams, Link, useLocation } from "wouter";
import { MapPin, Briefcase, Heart, Bookmark, Building, Calendar, ArrowLeft, Share2, AlertCircle, Lock, LogIn, UserPlus, ShieldAlert, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getListingImage } from "@/lib/listing-image";
import { displayCompany } from "@/lib/utils";

const BASE_URL = "https://ozelguvenlik.online";

// Renders description with masked contact info placeholders as lock badges
function MaskedDescription({ text }: { text: string }) {
  const parts = text.split("[GİRİŞ_GEREKLİ]");
  if (parts.length === 1) return <span className="whitespace-pre-wrap">{text}</span>;
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <Link href="/giris">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-[11px] font-semibold mx-0.5 cursor-pointer hover:bg-primary/20 transition-colors">
                <Lock className="w-2.5 h-2.5" /> Giriş yap
              </span>
            </Link>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const listingId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    company: "",
    city: "",
    workType: "",
    salary: "",
    description: "",
    requirements: "",
    applyUrl: "",
  });

  const { data: listing, isLoading, isError } = useGetListing(listingId, {
    query: {
      enabled: !!listingId,
      queryKey: getGetListingQueryKey(listingId)
    }
  });

  const toggleLike = useToggleListingLike();
  const toggleFavorite = useToggleListingFavorite();
  const canManageListing = user?.role === "admin" || user?.role === "moderator";

  /* ── SEO useEffect: her zaman aynı sırada çağrılmalı ─────────────── */
  const pageUrl = `${BASE_URL}/ilan/${listingId}`;
  useEffect(() => {
    if (!listing) return;
    const validThrough = (listing as any).expiresAt
      ? new Date((listing as any).expiresAt).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const originalTitle = document.title;
    document.title = `${listing.title} | ${displayCompany(listing.company)} — Özel Güvenlik İş İlanları`;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) { metaDesc = document.createElement("meta"); metaDesc.setAttribute("name", "description"); document.head.appendChild(metaDesc); }
    metaDesc.setAttribute("content", `${listing.city} bölgesinde ${displayCompany(listing.company)} firmasına ${listing.workType || "Tam Zamanlı"} özel güvenlik görevlisi alımı. ${listing.salary ? listing.salary + " maaş." : ""} Hemen başvur.`);

    let metaKeywords = document.querySelector('meta[name="keywords"]') as HTMLMetaElement | null;
    if (!metaKeywords) { metaKeywords = document.createElement("meta"); metaKeywords.setAttribute("name", "keywords"); document.head.appendChild(metaKeywords); }
    metaKeywords.setAttribute("content", `ozel guvenlik is ilanlari, ${listing.city} guvenlik, silahli guvenlik, silahsiz guvenlik, bay bayan guvenlik, AVM guvenlik, fabrika guvenlik, site guvenlik`);

    let can = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!can) { can = document.createElement("link"); can.setAttribute("rel", "canonical"); document.head.appendChild(can); }
    can.setAttribute("href", pageUrl);

    let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
    if (!ogTitle) { ogTitle = document.createElement("meta"); ogTitle.setAttribute("property", "og:title"); document.head.appendChild(ogTitle); }
    ogTitle.setAttribute("content", listing.title);

    let ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
    if (!ogDesc) { ogDesc = document.createElement("meta"); ogDesc.setAttribute("property", "og:description"); document.head.appendChild(ogDesc); }
    ogDesc.setAttribute("content", `${listing.city} bölgesinde ${displayCompany(listing.company)} firmasına ${listing.workType || "Tam Zamanlı"} özel güvenlik görevlisi alımı.`);

    let ogImg = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    if (!ogImg) { ogImg = document.createElement("meta"); ogImg.setAttribute("property", "og:image"); document.head.appendChild(ogImg); }
    ogImg.setAttribute("content", listing.companyLogoUrl || `${BASE_URL}/og-image.jpg`);

    let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
    if (!ogUrl) { ogUrl = document.createElement("meta"); ogUrl.setAttribute("property", "og:url"); document.head.appendChild(ogUrl); }
    ogUrl.setAttribute("content", pageUrl);

    let ogType = document.querySelector('meta[property="og:type"]') as HTMLMetaElement | null;
    if (!ogType) { ogType = document.createElement("meta"); ogType.setAttribute("property", "og:type"); document.head.appendChild(ogType); }
    ogType.setAttribute("content", "article");

    const prevLd = document.head.querySelectorAll('script[data-dynamic-ld="1"]');
    prevLd.forEach(el => el.remove());
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.setAttribute("data-dynamic-ld", "1");
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      "title": listing.title,
      "description": (listing.description || "").slice(0, 250) + ((listing.description || "").length > 250 ? "..." : ""),
      "identifier": { "@type": "PropertyValue", "name": "Özel Güvenlik Online", "value": `#${listing.id}` },
      "datePosted": listing.createdAt || new Date().toISOString(),
      "validThrough": validThrough,
      "employmentType": listing.workType || "Tam Zamanlı",
      "hiringOrganization": { "@type": "Organization", "name": displayCompany(listing.company), "sameAs": BASE_URL },
      "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": listing.city, "addressCountry": "TR" } },
      "baseSalary": { "@type": "MonetaryAmount", "currency": "TRY", "value": { "@type": "QuantitativeValue", "text": listing.salary || "Belirtilmedi" } },
      "image": listing.companyLogoUrl || `${BASE_URL}/og-image.jpg`,
    });
    document.head.appendChild(script);

    return () => {
      document.title = originalTitle;
      prevLd.forEach(el => el.remove());
    };
  }, [listing?.id, pageUrl]);

  const openEdit = () => {
    if (!listing) return;
    setEditForm({
      title: listing.title,
      company: listing.company,
      city: listing.city,
      workType: listing.workType,
      salary: listing.salary ?? "",
      description: listing.description ?? "",
      requirements: listing.requirements ?? "",
      applyUrl: listing.applyUrl ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const token = localStorage.getItem("auth_token") ?? "";
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "İlan güncellenemedi", description: data.error || "Hata oluştu", variant: "destructive" });
      return;
    }
    toast({ title: `İlan #${listingId} güncellendi` });
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
  };

  const changeCity = async () => {
    if (!listing) return;
    const nextCity = window.prompt("İlanın il / ilçe / semt bilgisini değiştir", listing.city);
    if (!nextCity || nextCity.trim() === listing.city.trim()) return;
    const token = localStorage.getItem("auth_token") ?? "";
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ city: nextCity.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "İl değiştirilemedi", description: data.error || "Hata oluştu", variant: "destructive" });
      return;
    }
    toast({ title: `İlan #${listingId} il bilgisi güncellendi` });
    await queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
  };

  const deleteListing = async () => {
    if (!window.confirm(`#${listingId} numaralı ilan silinsin mi?`)) return;
    const token = localStorage.getItem("auth_token") ?? "";
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "İlan silinemedi", description: data.error || "Hata oluştu", variant: "destructive" });
      return;
    }
    toast({ title: `İlan #${listingId} silindi` });
    navigate("/ilanlar");
  };

  const handleLike = async () => {
    if (!user) { toast({ title: "Giriş yapmalısınız", variant: "destructive" }); return; }
    if (!listing) return;
    try {
      const res = await toggleLike.mutateAsync({ id: listingId });
      queryClient.setQueryData(getGetListingQueryKey(listingId), (old: any) =>
        old ? { ...old, isLikedByMe: res.liked, likeCount: res.likeCount } : old
      );
    } catch {
      toast({ title: "Hata", description: "Beğenirken bir hata oluştu.", variant: "destructive" });
    }
  };

  const handleFavorite = async () => {
    if (!user) { toast({ title: "Giriş yapmalısınız", variant: "destructive" }); return; }
    if (!listing) return;
    try {
      const res = await toggleFavorite.mutateAsync({ id: listingId });
      queryClient.setQueryData(getGetListingQueryKey(listingId), (old: any) =>
        old ? { ...old, isFavoritedByMe: res.favorited } : old
      );
      toast({ title: res.favorited ? "Favorilere eklendi" : "Favorilerden çıkarıldı" });
    } catch {
      toast({ title: "Hata", description: "İşlem başarısız.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-1/4 mb-4" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (isError || !listing) {
    return (
      <Layout>
        <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.25)]">
            <Trash2 className="w-10 h-10 text-red-400" />
          </div>

          <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-400/30 px-3 py-1 text-xs font-black text-red-300 mb-4">
            {isError ? "❌ SİLİNDİ" : "🚫 KALDIRILDI"}
          </span>

          <h2 className="text-2xl font-bold mb-3">
            {isError ? "Bu İlan Silinmiştir" : "Bu İlan Kaldırılmıştır"}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-2 max-w-xs">
            {isError
              ? "İlan sahibi veya yönetim tarafından kalıcı olarak silinmiştir."
              : "İlan yayından kaldırılmış veya yönetim onayından geçmemiştir."}
          </p>
          <p className="text-xs text-muted-foreground/60 mb-8">
            İlan No: #{listingId}
          </p>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.history.back()} className="rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Geri
            </Button>
            <Link href="/ilanlar">
              <Button className="rounded-xl bg-gradient-to-r from-primary to-secondary">
                İlanlara Dön
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Giriş yapmayan kullanıcılara erişim engeli ───────────────────
  if (!user) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-7rem)] flex flex-col items-center justify-center p-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            <div className="w-20 h-20 bg-primary/15 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/30 shadow-[0_0_30px_rgba(79,70,229,0.25)]">
              <ShieldAlert className="w-10 h-10 text-primary" />
            </div>

            <h2 className="text-xl font-bold mb-3">Üyelere Özel İçerik</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              İlan detayını görmek, iletişim bilgilerine ulaşmak ve başvuru yapmak için giriş yapmanız veya üye olmanız gerekmektedir.
            </p>

            <div className="space-y-3">
              <Link href="/giris" className="block">
                <Button className="w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-secondary text-white font-semibold shadow-lg gap-2">
                  <LogIn className="w-4 h-4" />
                  Giriş Yap
                </Button>
              </Link>
              <Link href="/kayit" className="block">
                <Button variant="outline" className="w-full h-12 rounded-2xl border-white/15 bg-white/5 font-semibold gap-2 hover:bg-white/10 transition-colors">
                  <UserPlus className="w-4 h-4" />
                  Ücretsiz Kayıt Ol
                </Button>
              </Link>
              <Link href="/ilanlar" className="block">
                <button className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Geri Dön
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  const heroImage = getListingImage(listing.title, listing.company, listing.companyLogoUrl, listing.id);

  return (
    <Layout>
      <div className="pb-28">
        <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
          <button onClick={() => window.history.back()} className="flex items-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5 mr-1" />
            <span className="text-sm font-medium">Geri</span>
          </button>
          <div className="flex space-x-1">
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={handleFavorite}>
              <Bookmark className={`w-4 h-4 ${listing.isFavoritedByMe ? "fill-primary text-primary" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => {
              if (navigator.share) navigator.share({ title: listing.title, text: listing.company, url: window.location.href });
            }}>
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="relative w-full h-44 overflow-hidden">
          <img src={heroImage} alt={listing.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          {listing.isFeatured && (
            <div className="absolute top-3 right-3 bg-amber-500 text-amber-950 text-[10px] font-bold px-2.5 py-1 rounded-full">
              ÖNE ÇIKAN
            </div>
          )}
        </div>

        <div className="p-4 -mt-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl p-5 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 blur-3xl rounded-full pointer-events-none" />

            <div className="flex items-start gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-secondary/20 flex items-center justify-center text-lg font-bold shrink-0 border border-white/10">
                {(displayCompany(listing.company) ?? listing.title).charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center rounded-full bg-primary/15 border border-primary/25 px-2 py-0.5 text-[10px] font-black text-primary mb-2">
                  İlan No #{listing.id}
                </span>
                <h1 className="text-xl font-bold leading-tight">{listing.title}</h1>
                {displayCompany(listing.company) && (
                  <p className="text-primary font-medium text-sm mt-0.5">{displayCompany(listing.company)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center text-muted-foreground mb-1">
                  <MapPin className="w-3.5 h-3.5 mr-1.5" />
                  <span className="text-xs">Konum</span>
                </div>
                <span className="font-semibold text-sm">{listing.city}</span>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <div className="flex items-center text-muted-foreground mb-1">
                  <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                  <span className="text-xs">Çalışma Şekli</span>
                </div>
                <span className="font-semibold text-sm">{listing.workType}</span>
              </div>
              {listing.salary && (
                <div className="bg-white/5 rounded-xl p-3 col-span-2">
                  <div className="flex items-center text-muted-foreground mb-1">
                    <Building className="w-3.5 h-3.5 mr-1.5" />
                    <span className="text-xs">Maaş Bilgisi</span>
                  </div>
                  <span className="font-semibold text-sm text-green-400">{listing.salary}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-white/10">
              <div className="flex items-center space-x-4">
                <button onClick={handleLike} className="flex items-center space-x-1.5 hover:text-red-400 transition-colors">
                  <Heart className={`w-4 h-4 ${listing.isLikedByMe ? "fill-red-500 text-red-500" : ""}`} />
                  <span>{listing.likeCount}</span>
                </button>
                <div className="flex items-center space-x-1.5">
                  <span className="font-medium">{listing.viewCount}</span>
                  <span>Görüntülenme</span>
                </div>
              </div>
              <div className="flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1" />
                {new Date(listing.createdAt).toLocaleDateString("tr-TR")}
              </div>
            </div>
          </motion.div>

          {canManageListing && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5">
              <div className="glass-card rounded-2xl p-3 border border-primary/20">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <p className="text-xs font-black text-primary">Admin / Moderatör İşlemleri</p>
                    <p className="text-[10px] text-muted-foreground">İlan No: #{listing.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <Button size="sm" variant="outline" onClick={changeCity} className="h-8 text-[10px] border-white/10 bg-white/5">
                      <MapPin className="w-3 h-3 mr-1" /> İl Değiştir
                    </Button>
                    <Button size="sm" variant="outline" onClick={openEdit} className="h-8 text-[10px] border-white/10 bg-white/5">
                      <Edit2 className="w-3 h-3 mr-1" /> Düzenle
                    </Button>
                    <Button size="sm" onClick={deleteListing} className="h-8 text-[10px] bg-destructive/90 hover:bg-destructive text-white">
                      <Trash2 className="w-3 h-3 mr-1" /> Sil
                    </Button>
                  </div>
                </div>

                {editing && (
                  <div className="space-y-2 border-t border-white/10 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Başlık" className="glass-card border-white/10 text-sm" />
                      <Input value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} placeholder="Firma" className="glass-card border-white/10 text-sm" />
                      <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} placeholder="İl / İlçe / Semt" className="glass-card border-white/10 text-sm" />
                      <Input value={editForm.salary} onChange={e => setEditForm(f => ({ ...f, salary: e.target.value }))} placeholder="Maaş / Yan haklar" className="glass-card border-white/10 text-sm" />
                      <Input value={editForm.workType} onChange={e => setEditForm(f => ({ ...f, workType: e.target.value }))} placeholder="Çalışma şekli" className="glass-card border-white/10 text-sm" />
                      <Input value={editForm.applyUrl} onChange={e => setEditForm(f => ({ ...f, applyUrl: e.target.value }))} placeholder="Başvuru linki / telefon" className="glass-card border-white/10 text-sm" />
                    </div>
                    <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Açıklama" className="glass-card border-white/10 text-sm min-h-[110px]" />
                    <Textarea value={editForm.requirements} onChange={e => setEditForm(f => ({ ...f, requirements: e.target.value }))} placeholder="Aranan nitelikler" className="glass-card border-white/10 text-sm min-h-[80px]" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={saveEdit} size="sm" className="text-xs">Kaydet</Button>
                      <Button onClick={() => setEditing(false)} size="sm" variant="outline" className="text-xs border-white/10">İptal</Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {listing.description && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5">
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <h3 className="text-base font-bold">İş Tanımı</h3>
                <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                  #{listing.id}
                </span>
              </div>
              <div className="glass-card rounded-2xl p-4 text-sm leading-relaxed text-foreground/90">
                <MaskedDescription text={listing.description} />
              </div>
            </motion.div>
          )}

          {listing.requirements && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-5">
              <h3 className="text-base font-bold mb-2 px-1">Aranan Nitelikler</h3>
              <div className="glass-card rounded-2xl p-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {listing.requirements}
              </div>
            </motion.div>
          )}

          {!user && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-5">
              <div className="glass-card rounded-2xl p-5 flex flex-col items-center text-center border border-primary/20">
                <Lock className="w-8 h-8 text-primary mb-3" />
                <p className="text-sm font-semibold mb-1">İletişim Bilgileri</p>
                <p className="text-xs text-muted-foreground mb-4">
                  İşe başvuru linki ve iletişim bilgilerini görmek için giriş yapmalısınız.
                </p>
                <Link href="/giris">
                  <Button size="sm" className="bg-gradient-to-r from-primary to-secondary gap-2">
                    <LogIn className="w-4 h-4" />
                    Giriş Yap
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </div>

        <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/90 to-transparent z-40">
          <div className="max-w-md mx-auto">
            {user ? (
              listing.applyUrl ? (
                <a href={listing.applyUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button className="w-full h-12 rounded-full text-base font-bold bg-gradient-to-r from-primary via-secondary to-accent shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                    Hemen Başvur
                  </Button>
                </a>
              ) : (
                <Button disabled className="w-full h-12 rounded-full text-base font-bold bg-white/10 text-muted-foreground border border-white/5">
                  Başvuru Linki Yok
                </Button>
              )
            ) : (
              <Link href="/giris" className="block">
                <Button className="w-full h-12 rounded-full text-base font-bold bg-white/10 border border-primary/30 gap-2 hover:bg-primary/20 transition-all">
                  <Lock className="w-4 h-4" />
                  Başvurmak için Giriş Yap
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
