import React from "react";
import { useRegister } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const registerSchema = z
  .object({
    firstName:       z.string().min(2, "Ad en az 2 karakter olmalıdır."),
    lastName:        z.string().min(2, "Soyad en az 2 karakter olmalıdır."),
    username:        z.string().min(3, "Kullanıcı adı en az 3 karakter olmalıdır."),
    email:           z.string().email("Geçerli bir e-posta adresi girin."),
    password:        z.string().min(6, "Şifre en az 6 karakter olmalıdır."),
    confirmPassword: z.string().min(1, "Şifre tekrarını girin."),
  })
  .refine(v => v.password === v.confirmPassword, {
    message: "Şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const queryClient = useQueryClient();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", username: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      const response = await registerMutation.mutateAsync({
        data: {
          username: values.username,
          email: values.email,
          password: values.password,
          ...({ firstName: values.firstName, lastName: values.lastName } as any),
        },
      });
      if (response?.token) {
        localStorage.setItem("auth_token", response.token);
      }
      await queryClient.invalidateQueries();
      toast({ title: "Kayıt başarılı", description: "Yönlendiriliyorsunuz..." });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error?.message || "Kayıt yapılamadı. Bilgilerinizi kontrol edin.",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-4 pb-20">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/30 shadow-[0_0_20px_rgba(79,70,229,0.3)]">
              <ShieldAlert className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Aramıza Katıl
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Sohbette sadece adınız görünür</p>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ad</FormLabel>
                        <FormControl>
                          <Input placeholder="Ahmet" className="glass-card border-white/10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Soyad</FormLabel>
                        <FormControl>
                          <Input placeholder="Yılmaz" className="glass-card border-white/10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kullanıcı Adı</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="guvenlik_uzmanı"
                          className="glass-card border-white/10"
                          {...field}
                          data-testid="input-username"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Posta</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="ornek@email.com"
                          className="glass-card border-white/10"
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şifre</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="En az 6 karakter"
                          className="glass-card border-white/10"
                          {...field}
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şifre Tekrarı</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Şifrenizi tekrar girin"
                          className="glass-card border-white/10"
                          {...field}
                          data-testid="input-confirm-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white shadow-lg mt-2"
                  data-testid="button-submit-register"
                >
                  {registerMutation.isPending ? "Kayıt olunuyor..." : "Kayıt Ol"}
                </Button>
              </form>
            </Form>
          </div>

          <p className="text-center mt-6 text-sm text-muted-foreground">
            Zaten hesabınız var mı?{" "}
            <Link href="/giris" className="text-accent hover:underline font-medium">
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
