import React, { useEffect, useRef, useState } from "react";
import { useCreateListing } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ImagePlus, Link2, X, Upload, Sparkles, RefreshCw, Phone } from "lucide-react";

const CARD_THEME_OPTIONS = [
  { value: "auto", label: "Otomatik" },
  { value: "urgent", label: "Acil / Kırmızı" },
  { value: "gold", label: "Gold" },
  { value: "radar", label: "Radar / Mavi" },
  { value: "vip", label: "VIP / Mor" },
  { value: "night", label: "Gece / Mor" },
  { value: "map", label: "Harita / Yeşil" },
  { value: "tactical", label: "Taktik / Koyu Yeşil" },
  { value: "holo", label: "Hologram" },
  { value: "light", label: "Beyaz Premium" },
] as const;

const listingSchema = z.object({
  title: z.string().min(5, "Başlık en az 5 karakter olmalıdır."),
  company: z.string().optional(),
  city: z.string().min(2, "Şehir zorunludur."),
  workType: z.string().min(1, "Çalışma şekli seçiniz."),
  salary: z.string().optional(),
  description: z.string().min(20, "Açıklama en az 20 karakter olmalıdır."),
  requirements: z.string().optional(),
  applyUrl: z.string().optional(),
  companyLogoUrl: z.string().optional(),
  cardTheme: z.string().optional(),
});

type ListingFormValues = z.infer<typeof listingSchema>;

export default function AddListing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateListing();
  const { user } = useAuth();
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [smartText, setSmartText] = useState("");
  const [smartLoading, setSmartLoading] = useState(false);

  // Image upload state
  const [imageMode, setImageMode] = useState<"file" | "url">("file");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setImagePreview(localPreview);

    setImageUploading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/listings/image-upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Yükleme başarısız");
      const data = (await res.json()) as { url: string };
      form.setValue("companyLogoUrl", data.url);
      setImagePreview(data.url);
    } catch {
      toast({ title: "Resim yüklenemedi", description: "Lütfen tekrar deneyin.", variant: "destructive" });
      setImagePreview("");
      form.setValue("companyLogoUrl", "");
    } finally {
      setImageUploading(false);
    }
  };

  const clearImage = () => {
    setImagePreview("");
    form.setValue("companyLogoUrl", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: "", company: "", city: "", workType: "", salary: "", description: "", requirements: "", applyUrl: "", cardTheme: "auto"
    },
  });

  useEffect(() => {
    if (!user) setLocation("/giris");
  }, [user, setLocation]);

  if (!user) return null;

  const parseSmartListing = async () => {
    if (!smartText.trim()) return;
    setSmartLoading(true);
    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const res = await fetch("/api/listings/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: smartText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ayıklama başarısız");
      form.setValue("title", data.title || "");
      form.setValue("company", data.company || "Belirtilmedi");
      form.setValue("city", [data.city, data.district].filter(Boolean).join(" / ") || "Türkiye");
      form.setValue("workType", data.workType || "Tam Zamanlı");
      form.setValue("salary", data.salary || "");
      form.setValue("description", data.description || smartText);
      form.setValue("requirements", [data.requirements, data.benefits ? `Yan Haklar: ${data.benefits}` : null, data.gender ? `Cinsiyet: ${data.gender}` : null].filter(Boolean).join("\n"));
      form.setValue("applyUrl", data.applyUrl || "");
      if (data.companyLogoUrl) {
        form.setValue("companyLogoUrl", data.companyLogoUrl);
        setImagePreview(data.companyLogoUrl);
      }
      toast({ title: "İlan bilgileri ayıklandı", description: "Alanları kontrol edip yayınlayabilirsiniz." });
    } catch (error: any) {
      toast({ title: "Ayıklama başarısız", description: error.message, variant: "destructive" });
    } finally {
      setSmartLoading(false);
    }
  };

  const onSubmit = async (values: ListingFormValues) => {
    setDupWarning(null);
    try {
      const payload: Record<string, unknown> = {
        ...values,
        company: values.company?.trim() || "Belirtilmedi",
        salary: values.salary || null,
        requirements: values.requirements || null,
        applyUrl: values.applyUrl || null,
        companyLogoUrl: values.companyLogoUrl || null,
        cardTheme: values.cardTheme && values.cardTheme !== "auto" ? values.cardTheme : null,
      };
      await createMutation.mutateAsync({ data: payload as any });
      toast({ title: "İlan başarıyla yayınlandı", description: "İlan 1 ay boyunca yayında kalacaktır. Adminlere inceleme bildirimi gönderildi." });
      setLocation("/ilanlar");
    } catch (error: any) {
      const serverMsg = (error?.data as any)?.error || error?.message || "İlan eklenirken bir hata oluştu.";
      if (error?.status === 409) {
        setDupWarning(serverMsg);
      } else {
        toast({ title: "Hata", description: serverMsg, variant: "destructive" });
      }
    }
  };

  return (
    <Layout>
      <div className="p-4 space-y-5">
        <h1 className="text-xl font-bold">İlan Oluştur</h1>
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/10 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-black">Akıllı İlan Ayıklama</p>
                <p className="text-[11px] text-muted-foreground">WhatsApp/Telegram ilan metnini yapıştır, il-ilçe, telefon, maaş ve yan hakları otomatik dolduralım.</p>
              </div>
            </div>
            <Textarea
              value={smartText}
              onChange={e => setSmartText(e.target.value)}
              placeholder="İlan metnini buraya yapıştır..."
              className="glass-card border-white/10 min-h-[105px] text-xs"
            />
            <Button type="button" onClick={parseSmartListing} disabled={smartLoading || !smartText.trim()} className="w-full text-sm">
              {smartLoading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Ayıklanıyor...</> : <><Sparkles className="w-4 h-4 mr-2" /> Akıllı Ayıkla ve Doldur</>}
            </Button>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İlan Başlığı</FormLabel>
                    <FormControl>
                      <Input placeholder="Örn: Silahlı Özel Güvenlik" className="glass-card border-white/10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şirket Adı</FormLabel>
                      <FormControl>
                        <Input placeholder="Şirket A.Ş." className="glass-card border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İl / İlçe / Semt</FormLabel>
                      <FormControl>
                        <Input placeholder="İstanbul / Kadıköy" className="glass-card border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="workType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Çalışma Şekli</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="glass-card border-white/10">
                            <SelectValue placeholder="Seçiniz" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Tam Zamanlı">Tam Zamanlı</SelectItem>
                          <SelectItem value="Yarı Zamanlı">Yarı Zamanlı</SelectItem>
                          <SelectItem value="Vardiyalı">Vardiyalı</SelectItem>
                          <SelectItem value="Proje Bazlı">Proje Bazlı</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salary"
                  render={({ field }) => (
                    <FormItem>
                    <FormLabel>Maaş / Yan Haklar</FormLabel>
                      <FormControl>
                        <Input placeholder="Maaş, servis, yemek, prim..." className="glass-card border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="cardTheme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kart Rengi / Tipi</FormLabel>
                    <select
                      value={field.value || "auto"}
                      onChange={field.onChange}
                      className="w-full bg-[#111827] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary/50"
                    >
                      {CARD_THEME_OPTIONS.map(option => (
                        <option key={option.value} value={option.value} className="bg-[#111827] text-white">{option.label}</option>
                      ))}
                    </select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                İlan otomatik olarak 1 ay yayında kalır. Yayınlandıktan sonra adminlere inceleme bildirimi gider.
              </div>

              <FormField
                control={form.control}
                name="applyUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Telefon / Başvuru Linki</FormLabel>
                    <FormControl>
                      <Input placeholder="tel:0532... veya https://..." className="glass-card border-white/10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İş Tanımı</FormLabel>
                    <FormControl>
                      <Textarea placeholder="İş detaylarını buraya yazın..." className="glass-card border-white/10 min-h-[100px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requirements"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yan Haklar / Aranan Nitelikler</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Servis, yemek, SGK, cinsiyet, yaş, sertifika..." className="glass-card border-white/10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── İlan Görseli ── */}
              <div className="space-y-2">
                <label className="text-sm font-medium block">İlan Görseli (Opsiyonel)</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setImageMode("file"); clearImage(); }}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${imageMode === "file" ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-muted-foreground hover:border-white/20"}`}
                  >
                    <ImagePlus className="w-4 h-4" />
                    Galeriden Seç
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImageMode("url"); clearImage(); }}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${imageMode === "url" ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-muted-foreground hover:border-white/20"}`}
                  >
                    <Link2 className="w-4 h-4" />
                    Link ile Ekle
                  </button>
                </div>

                {imageMode === "file" && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    {!imagePreview ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-28 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
                      >
                        <Upload className="w-6 h-6" />
                        <span className="text-xs">Galeriden resim seç</span>
                      </button>
                    ) : (
                      <div className="relative rounded-xl overflow-hidden">
                        <img src={imagePreview} alt="Önizleme" className="w-full h-36 object-cover" />
                        {imageUploading && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white">
                            Yükleniyor...
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={clearImage}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {imageMode === "url" && (
                  <FormField
                    control={form.control}
                    name="companyLogoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="https://resim.com/foto.jpg"
                            className="glass-card border-white/10"
                            {...field}
                            onChange={e => {
                              field.onChange(e);
                              setImagePreview(e.target.value);
                            }}
                          />
                        </FormControl>
                        {imagePreview && (
                          <div className="relative rounded-xl overflow-hidden mt-2">
                            <img src={imagePreview} alt="Önizleme" className="w-full h-32 object-cover" onError={() => setImagePreview("")} />
                            <button
                              type="button"
                              onClick={clearImage}
                              className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <p className="text-[10px] text-muted-foreground">Boş bırakırsanız ilan başlığına göre otomatik resim atanır.</p>
              </div>

              {dupWarning && (
                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300 leading-relaxed">
                  {dupWarning}
                </div>
              )}

              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full bg-gradient-to-r from-primary to-secondary text-white shadow-lg mt-2"
              >
                {createMutation.isPending ? "Ekleniyor..." : "İlanı Gönder"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </Layout>
  );
}
