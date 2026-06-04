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
import { Calendar, Clock, Infinity, ImagePlus, Link2, X, Upload } from "lucide-react";

const listingSchema = z.object({
  title: z.string().min(5, "Başlık en az 5 karakter olmalıdır."),
  company: z.string().optional(),
  city: z.string().min(2, "Şehir zorunludur."),
  workType: z.string().min(1, "Çalışma şekli seçiniz."),
  salary: z.string().optional(),
  description: z.string().min(20, "Açıklama en az 20 karakter olmalıdır."),
  requirements: z.string().optional(),
  applyUrl: z.string().url("Geçerli bir başvuru linki (URL) girin.").optional().or(z.literal('')),
  companyLogoUrl: z.string().optional(),
});

type ListingFormValues = z.infer<typeof listingSchema>;

export default function AddListing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateListing();
  const { user } = useAuth();
  const [isTimed, setIsTimed] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [dupWarning, setDupWarning] = useState<string | null>(null);

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
      title: "", company: "", city: "", workType: "", salary: "", description: "", requirements: "", applyUrl: ""
    },
  });

  useEffect(() => {
    if (!user) setLocation("/giris");
  }, [user, setLocation]);

  if (!user) return null;

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
      };
      if (isTimed && expiresAt) {
        payload.expiresAt = new Date(expiresAt).toISOString();
      }
      await createMutation.mutateAsync({ data: payload as any });
      toast({ title: "İlan başarıyla eklendi", description: "7 gün boyunca yayında kalacaktır." });
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
        <h1 className="text-xl font-bold">İlan Ekle</h1>
        <div className="glass-card rounded-2xl p-5">
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
                      <FormLabel>Şehir</FormLabel>
                      <FormControl>
                        <Input placeholder="İstanbul" className="glass-card border-white/10" {...field} />
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
                      <FormLabel>Maaş (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input placeholder="25.000 TL" className="glass-card border-white/10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">İlan Süresi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTimed(false)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${!isTimed ? "border-primary bg-primary/20 text-primary-foreground" : "border-white/10 text-muted-foreground hover:border-white/20"}`}
                  >
                    <Infinity className="w-4 h-4" />
                    Süresiz
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTimed(true)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${isTimed ? "border-accent bg-accent/20 text-accent" : "border-white/10 text-muted-foreground hover:border-white/20"}`}
                  >
                    <Clock className="w-4 h-4" />
                    Süreli
                  </button>
                </div>
                {isTimed && (
                  <div className="mt-3">
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Bitiş Tarihi
                    </label>
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={e => setExpiresAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full glass-card border border-white/10 rounded-xl px-3 py-2 text-sm bg-transparent text-foreground"
                    />
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="applyUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Başvuru Linki (Opsiyonel)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." className="glass-card border-white/10" {...field} />
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
                    <FormLabel>Aranan Nitelikler (Opsiyonel)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Adaylarda aranan özellikler..." className="glass-card border-white/10" {...field} />
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
