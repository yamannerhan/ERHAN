import React, { useState, useEffect } from "react";
import { useGetListing, useToggleListingFavorite, getGetListingQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useParams, Link, useLocation } from "wouter";
import {
  MapPin, Briefcase, Bookmark, Calendar, ArrowLeft, Share2,
  ShieldAlert, LogIn, UserPlus, Shield, Trash2, Star, Eye, Clock,
  GraduationCap, Users, Flag, Lock, FileText, BadgeCheck, Send, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getListingImage } from "@/lib/listing-image";
import { displayCompany } from "@/lib/utils";
import { markListingRead } from "@/lib/read-listings";
import { resolveApplyHref, extractPhoneFromText } from "@/lib/apply-url";
import {
  SEO_BASE_URL, SEO_OG_IMAGE, buildListingTitle, buildListingDescription,
  buildJobPostingSchema, breadcrumbSchema,
} from "@/lib/seo-config";
import "@/components/listing-detail-page.css";

type ExtListing = {
  expiresAt?: string | null;
  companyVerified?: boolean;
};

function MaskedDescription({ text }: { text: string }) {
  const parts = text.split("[GİRİŞ_GEREKLİ]");
  if (parts.length === 1) return <span>{text}</span>;
  return (
    <span>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <Link href="/giris">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-[11px] font-semibold mx-0.5">
                <Lock className="w-2.5 h-2.5" /> Giriş yap
              </span>
            </Link>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

function toBulletList(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*●]\s*/, "").trim())
    .filter(Boolean);
}

function detectArmed(blob: string): string | null {
  const t = blob.toLocaleLowerCase("tr-TR");
  if (/silahs[ıi]z/.test(t)) return "Silahsız";
  if (/silahl[ıi]/.test(t)) return "Silahlı";
  return null;
}

function detectShift(blob: string): string {
  const t = blob.toLocaleLowerCase("tr-TR");
  if (/2\s*\+\s*2\s*\+\s*2|2\+2\+2/.test(t)) return "2+2+2";
  if (/12\s*[\/\-]\s*24/.test(t)) return "12/24 Vardiya";
  if (/24\s*[\/\-]\s*48/.test(t)) return "24/48 Vardiya";
  if (/vardiya/.test(t)) return "Vardiyalı";
  return "Belirtilmedi";
}

function detectEducation(blob: string): string {
  const t = blob.toLocaleLowerCase("tr-TR");
  if (/üniversite|lisans/.test(t)) return "Üniversite";
  if (/önlisans/.test(t)) return "Önlisans";
  if (/lise/.test(t)) return "En Az Lise";
  if (/ilkokul|ortaokul/.test(t)) return "İlköğretim";
  return "Belirtilmedi";
}

function detectExperience(blob: string): string {
  const t = blob.toLocaleLowerCase("tr-TR");
  const m = t.match(/(\d+)\s*y[ıi]l/);
  if (m) return `${m[1]} Yıl`;
  if (/tecr[uü]besiz|deneyimsiz/.test(t)) return "Tecrübesiz";
  if (/tercihen/.test(t)) return "Tercihen 1 Yıl";
  return "Belirtilmedi";
}

function formatDateTr(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function splitDescription(desc: string): { intro: string; duties: string[] } {
  const bullets = toBulletList(desc);
  if (bullets.length >= 2) {
    const introLines = desc.split(/\n/).filter((l) => !/^[-•*●]/.test(l.trim()));
    return { intro: introLines.join("\n").trim(), duties: bullets };
  }
  return { intro: desc.trim(), duties: [] };
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
    title: "", company: "", city: "", workType: "", salary: "",
    description: "", requirements: "", applyUrl: "",
  });

  const { data: listing, isLoading, isError } = useGetListing(listingId, {
    query: { enabled: !!listingId, queryKey: getGetListingQueryKey(listingId) },
  });

  useEffect(() => {
    if (listingId > 0) markListingRead(listingId);
  }, [listingId]);

  const toggleFavorite = useToggleListingFavorite();
  const canManageListing = user?.role === "admin" || user?.role === "moderator";
  const ext = listing as (typeof listing & ExtListing) | undefined;

  const pageUrl = `${SEO_BASE_URL}/ilan/${listingId}`;
  useEffect(() => {
    if (!listing) return;
    const title = buildListingTitle(listing.title, displayCompany(listing.company));
    const description = buildListingDescription(
      listing.city, displayCompany(listing.company), listing.workType, listing.salary, listing.description,
    );
    const originalTitle = document.title;
    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) { metaDesc = document.createElement("meta"); metaDesc.setAttribute("name", "description"); document.head.appendChild(metaDesc); }
    metaDesc.setAttribute("content", description);

    let can = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!can) { can = document.createElement("link"); can.setAttribute("rel", "canonical"); document.head.appendChild(can); }
    can.setAttribute("href", pageUrl);

    const setOg = (prop: string, val: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
      el.setAttribute("content", val);
    };
    setOg("og:title", title);
    setOg("og:description", description);
    setOg("og:image", listing.companyLogoUrl || SEO_OG_IMAGE);
    setOg("og:url", pageUrl);

    const prevLd = document.head.querySelectorAll('script[data-dynamic-ld="1"]');
    prevLd.forEach((el) => el.remove());

    const jobSchema = buildJobPostingSchema({
      id: listing.id, title: listing.title, description: listing.description,
      company: listing.company, city: listing.city, salary: listing.salary,
      workType: listing.workType, companyLogoUrl: listing.companyLogoUrl,
      createdAt: listing.createdAt, expiresAt: ext?.expiresAt,
      applyUrl: listing.applyUrl,
    });
    const crumbs = breadcrumbSchema([
      { name: "Ana Sayfa", item: SEO_BASE_URL },
      { name: "İlanlar", item: `${SEO_BASE_URL}/ilanlar` },
      { name: listing.title ?? "İlan", item: pageUrl },
    ]);
    for (const schema of [jobSchema, crumbs]) {
      const script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      script.setAttribute("data-dynamic-ld", "1");
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }
    return () => { document.title = originalTitle; prevLd.forEach((el) => el.remove()); };
  }, [listing?.id, pageUrl, ext?.expiresAt]);

  const openEdit = () => {
    if (!listing) return;
    setEditForm({
      title: listing.title, company: listing.company, city: listing.city,
      workType: listing.workType, salary: listing.salary ?? "",
      description: listing.description ?? "", requirements: listing.requirements ?? "",
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
      toast({ title: "İlan güncellenemedi", description: data.error || "Hata", variant: "destructive" });
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
      toast({ title: "İl değiştirilemedi", variant: "destructive" });
      return;
    }
    toast({ title: "İl bilgisi güncellendi" });
    await queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
  };

  const deleteListing = async () => {
    if (!window.confirm(`#${listingId} numaralı ilan silinsin mi?`)) return;
    const token = localStorage.getItem("auth_token") ?? "";
    const res = await fetch(`/api/admin/listings/${listingId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast({ title: "İlan silinemedi", variant: "destructive" });
      return;
    }
    toast({ title: "İlan silindi" });
    navigate("/ilanlar");
  };

  const handleFavorite = async () => {
    if (!user) { toast({ title: "Giriş yapmalısınız", variant: "destructive" }); return; }
    if (!listing) return;
    try {
      const res = await toggleFavorite.mutateAsync({ id: listingId });
      queryClient.setQueryData(getGetListingQueryKey(listingId), (old: typeof listing) =>
        old ? { ...old, isFavoritedByMe: res.favorited } : old);
      toast({ title: res.favorited ? "Favorilere eklendi" : "Favorilerden çıkarıldı" });
    } catch {
      toast({ title: "İşlem başarısız", variant: "destructive" });
    }
  };

  const shareListing = async () => {
    const url = window.location.href;
    const title = listing?.title ?? "İlan";
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* fallback */ }
    }
    await navigator.clipboard.writeText(url);
    toast({ title: "Link kopyalandı" });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link kopyalandı" });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="og-ld-page og-ld-loading">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (isError || !listing) {
    return (
      <Layout>
        <div className="og-ld-page text-center py-16">
          <Trash2 className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Bu İlan Bulunamadı</h2>
          <p className="text-sm text-muted-foreground mb-6">İlan silinmiş veya kaldırılmış olabilir.</p>
          <Link href="/ilanlar" className="og-ld-apply-btn inline-flex max-w-xs">İlanlara Dön</Link>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="og-ld-gate">
          <ShieldAlert className="w-12 h-12 text-[#f5c518] mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Üyelere Özel İçerik</h2>
          <p className="text-sm text-muted-foreground mb-6">
            İlan detayını görmek ve başvuru yapmak için giriş yapın.
          </p>
          <Link href="/giris" className="og-ld-apply-btn block mb-3">
            <LogIn size={16} /> Giriş Yap
          </Link>
          <Link href="/kayit" className="og-ld-cv-btn block">
            <UserPlus size={16} /> Ücretsiz Kayıt Ol
          </Link>
        </div>
      </Layout>
    );
  }

  const companyName = displayCompany(listing.company) ?? listing.company;
  const logoUrl = getListingImage(listing.title, listing.company, listing.companyLogoUrl, listing.id);
  const blob = [listing.title, listing.description, listing.requirements].filter(Boolean).join("\n");
  const armed = detectArmed(blob);
  const { intro, duties } = splitDescription(listing.description ?? "");
  const reqBullets = toBulletList(listing.requirements);
  const applyHref = resolveApplyHref({
    applyUrl: listing.applyUrl,
    description: listing.description,
    requirements: listing.requirements,
    title: listing.title,
  });
  const phone = extractPhoneFromText([listing.applyUrl, listing.description, listing.requirements].join("\n"));
  const shareUrl = encodeURIComponent(window.location.href);
  const shareText = encodeURIComponent(`${listing.title} — ${companyName}`);
  const deadline = ext?.expiresAt ? formatDateTr(ext.expiresAt) : null;

  return (
    <Layout>
      <div className="og-ld-page">
        <header className="og-ld-top">
          <Link href="/ilanlar" className="og-ld-back">
            <ArrowLeft size={14} />
            İlanlara Geri Dön
          </Link>
          <div className="og-ld-top-actions">
            <button type="button" className="og-ld-top-btn" onClick={() => void shareListing()}>
              <Share2 /> Paylaş
            </button>
            <button
              type="button"
              className={`og-ld-top-btn ${listing.isFavoritedByMe ? "is-active" : ""}`}
              onClick={() => void handleFavorite()}
            >
              <Bookmark fill={listing.isFavoritedByMe ? "currentColor" : "none"} />
              Favorilere Ekle
            </button>
          </div>
        </header>

        <div className="og-ld-layout">
          <main>
            <article className="og-ld-card">
              {listing.isFeatured && (
                <div className="og-ld-featured">
                  <Star size={12} fill="currentColor" /> ÖNE ÇIKAN İLAN
                </div>
              )}

              <div className="og-ld-head">
                <div>
                  <h1 className="og-ld-title">{listing.title}</h1>
                  <div className="og-ld-salary">{listing.salary || "Maaş görüşmede"}</div>
                  <div className="og-ld-quick">
                    <span className="og-ld-quick-item"><MapPin /> {listing.city}</span>
                    <span className="og-ld-quick-item"><Briefcase /> {listing.workType || "Tam Zamanlı"}</span>
                    {armed && <span className="og-ld-quick-item"><Shield /> {armed}</span>}
                  </div>
                  <div className="og-ld-meta">
                    <span><FileText /> İlan No: #OG{listing.id}</span>
                    <span><Calendar /> {formatDateTr(listing.createdAt)}</span>
                    <span><Eye /> {listing.viewCount}</span>
                    {deadline && <span><Clock /> Son Başvuru: {deadline}</span>}
                  </div>
                </div>
                <div className="og-ld-company-box">
                  <div className="og-ld-company-logo">
                    <img src={logoUrl} alt={companyName} />
                  </div>
                  <div className="og-ld-company-name">{companyName}</div>
                  {ext?.companyVerified && (
                    <span className="og-ld-verified"><BadgeCheck size={10} /> Doğrulanmış Firma</span>
                  )}
                </div>
              </div>

              {listing.description && (
                <>
                  <h2 className="og-ld-section-title">İlan Açıklaması</h2>
                  <div className="og-ld-desc">
                    <MaskedDescription text={intro || listing.description} />
                  </div>
                </>
              )}

              <div className="og-ld-cols">
                <div>
                  <h3 className="og-ld-col-title">Görev Tanımı</h3>
                  <ul className="og-ld-list">
                    {(duties.length ? duties : toBulletList(listing.description)).slice(0, 8).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                    {!duties.length && !listing.description && <li>Detaylar firma ile görüşülecektir.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="og-ld-col-title">Aranan Nitelikler</h3>
                  <ul className="og-ld-list">
                    {(reqBullets.length ? reqBullets : ["Özel güvenlik sertifikası", "En az lise mezunu"]).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="og-ld-stats">
                <div className="og-ld-stat">
                  <div className="og-ld-stat-icon"><Users /></div>
                  <div className="og-ld-stat-label">Deneyim</div>
                  <div className="og-ld-stat-value">{detectExperience(blob)}</div>
                </div>
                <div className="og-ld-stat">
                  <div className="og-ld-stat-icon"><GraduationCap /></div>
                  <div className="og-ld-stat-label">Eğitim Durumu</div>
                  <div className="og-ld-stat-value">{detectEducation(blob)}</div>
                </div>
                <div className="og-ld-stat">
                  <div className="og-ld-stat-icon"><Briefcase /></div>
                  <div className="og-ld-stat-label">Çalışma Şekli</div>
                  <div className="og-ld-stat-value">{listing.workType || "Tam Zamanlı"}</div>
                </div>
                <div className="og-ld-stat">
                  <div className="og-ld-stat-icon"><Clock /></div>
                  <div className="og-ld-stat-label">Vardiya</div>
                  <div className="og-ld-stat-value">{detectShift(blob)}</div>
                </div>
                <div className="og-ld-stat">
                  <div className="og-ld-stat-icon"><MapPin /></div>
                  <div className="og-ld-stat-label">Çalışma Yeri</div>
                  <div className="og-ld-stat-value">{listing.city}</div>
                </div>
              </div>
            </article>

            {canManageListing && (
              <div className="og-ld-admin">
                <p className="text-xs font-bold text-primary mb-2">Admin / Moderatör</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button size="sm" variant="outline" onClick={changeCity} className="h-8 text-[10px]">İl Değiştir</Button>
                  <Button size="sm" variant="outline" onClick={openEdit} className="h-8 text-[10px]">Düzenle</Button>
                  <Button size="sm" onClick={deleteListing} className="h-8 text-[10px] bg-destructive">Sil</Button>
                </div>
                {editing && (
                  <div className="space-y-2 border-t border-white/10 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} placeholder="Başlık" className="text-sm h-8" />
                      <Input value={editForm.company} onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))} placeholder="Firma" className="text-sm h-8" />
                      <Input value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} placeholder="Şehir" className="text-sm h-8" />
                      <Input value={editForm.salary} onChange={(e) => setEditForm((f) => ({ ...f, salary: e.target.value }))} placeholder="Maaş" className="text-sm h-8" />
                    </div>
                    <Textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="text-sm min-h-[80px]" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={saveEdit}>Kaydet</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(false)}>İptal</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>

          <aside className="og-ld-aside">
            <div className="og-ld-side-card">
              <h2 className="og-ld-side-title">Firma Bilgileri</h2>
              <div className="og-ld-side-company">
                <div className="og-ld-side-logo">
                  <img src={logoUrl} alt="" />
                </div>
                <div>
                  <div className="og-ld-side-company-name">
                    {companyName}
                    {ext?.companyVerified && <BadgeCheck size={12} className="text-[#f5c518]" />}
                  </div>
                </div>
              </div>
              <p className="og-ld-side-text">
                {companyName} güvenlik sektöründe faaliyet gösteren bir kuruluştur.
              </p>
              {phone && <span className="og-ld-side-link">📞 {phone}</span>}
              <Link href={`/ilanlar?search=${encodeURIComponent(companyName)}`} className="og-ld-side-outline">
                Tüm İlanları Gör &gt;
              </Link>
            </div>

            <div className="og-ld-side-card">
              <h2 className="og-ld-side-title">Başvuru İşlemleri</h2>
              {applyHref && applyHref !== "auth_required" ? (
                <a
                  href={applyHref}
                  target={applyHref.startsWith("tel:") ? undefined : "_blank"}
                  rel={applyHref.startsWith("tel:") ? undefined : "noopener noreferrer"}
                  className="og-ld-apply-btn"
                >
                  <Send size={16} />
                  {applyHref.startsWith("tel:") ? "Hemen Başvur" : "Hemen Başvur"}
                </a>
              ) : (
                <button type="button" className="og-ld-apply-btn" disabled>
                  Telefon bulunamadı
                </button>
              )}
              <Link href="/cv-olustur" className="og-ld-cv-btn">
                <FileText size={16} /> CV&apos;mi Gönder
              </Link>
              <p className="og-ld-privacy">
                <Lock size={12} /> Bilgileriniz firma ile paylaşılacaktır
              </p>
            </div>

            <div className="og-ld-side-card">
              <h2 className="og-ld-side-title">İlanı Paylaş</h2>
              <div className="og-ld-share-row">
                <a
                  href={`https://wa.me/?text=${shareText}%20${shareUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="og-ld-share-btn og-ld-share-btn--wa"
                  aria-label="WhatsApp"
                >W</a>
                <a
                  href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="og-ld-share-btn og-ld-share-btn--tg"
                  aria-label="Telegram"
                >T</a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="og-ld-share-btn og-ld-share-btn--fb"
                  aria-label="Facebook"
                >f</a>
                <a
                  href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="og-ld-share-btn og-ld-share-btn--x"
                  aria-label="X"
                >𝕏</a>
                <button type="button" className="og-ld-share-btn og-ld-share-btn--copy" onClick={() => void copyLink()} aria-label="Kopyala">
                  <Copy size={14} />
                </button>
              </div>
              <Link href="/destek" className="og-ld-report">
                <Flag size={14} /> İlanı Şikayet Et
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
