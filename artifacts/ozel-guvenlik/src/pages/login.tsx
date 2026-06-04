import React from "react";
import { useLogin } from "@workspace/api-client-react";
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

const loginSchema = z.object({
  email: z.string().min(1, "Kullanıcı adı veya e-posta girin."),
  password: z.string().min(1, "Şifre girin."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const queryClient = useQueryClient();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const response = await loginMutation.mutateAsync({ data: values });
      if (response?.token) {
        localStorage.setItem("auth_token", response.token);
      }
      await queryClient.invalidateQueries();
      toast({ title: "Giriş başarılı", description: "Yönlendiriliyorsunuz..." });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error?.message || "Giriş yapılamadı. Bilgilerinizi kontrol edin.",
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
              ÖzelGüvenlik.Online
            </h1>
            <p className="text-muted-foreground mt-2">Hesabınıza giriş yapın</p>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kullanıcı Adı veya E-Posta</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="kullanici_adi veya ornek@email.com"
                          className="glass-card border-white/10"
                          autoCapitalize="none"
                          autoCorrect="off"
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
                          placeholder="******"
                          className="glass-card border-white/10"
                          {...field}
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white shadow-lg mt-6"
                  data-testid="button-submit-login"
                >
                  {loginMutation.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
                </Button>
              </form>
            </Form>
          </div>

          <p className="text-center mt-6 text-sm text-muted-foreground">
            Hesabınız yok mu?{" "}
            <Link href="/kayit" className="text-accent hover:underline font-medium">
              Kayıt Ol
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
