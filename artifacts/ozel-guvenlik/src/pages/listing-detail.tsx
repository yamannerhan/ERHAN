import React from "react";
import { useGetListing, useToggleListingLike, useToggleListingFavorite, getGetListingQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useParams, Link } from "wouter";
import { MapPin, Briefcase, Heart, Bookmark, Building, Calendar, ArrowLeft, Share2, AlertCircle, Lock, LogIn, UserPlus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getListingImage } from "@/lib/listing-image";
import { displayCompany } from "@/lib/utils";

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

  const { data: listing, isLoading, isError } = useGetListing(listingId, {
    query: {
      enabled: !!listingId,
      queryKey: getGetListingQueryKey(listingId)
    }
  });

  const toggleLike = useToggleListingLike();
  const toggleFavorite = useToggleListingFavorite();

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
        <div className="p-4 flex flex-col items-center justify-center min-h-[50vh] text-center">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold mb-2">İlan Bulunamadı</h2>
          <p className="text-muted-foreground mb-6">Bu ilan silinmiş veya yayından kaldırılmış olabilir.</p>
          <Link href="/ilanlar"><Button>İlanlara Dön</Button></Link>
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

  const heroImage = getListingImage(listing.title, listing.company, listing.companyLogoUrl);

  return (
    <Layout>
      <div className="pb-28">
        <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
          <Link href="/ilanlar" className="flex items-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5 mr-1" />
            <span className="text-sm font-medium">Geri</span>
          </Link>
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

          {listing.description && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5">
              <h3 className="text-base font-bold mb-2 px-1">İş Tanımı</h3>
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
