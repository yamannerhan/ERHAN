import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Search, FileText, Headphones, LogIn, UserPlus, X, Clock, PlusCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AnimatePresence, motion } from "framer-motion";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const navItems = [
    { icon: Home, label: "Ana Sayfa", path: "/" },
    { icon: Search, label: "İlanlar", path: "/ilanlar" },
    { icon: PlusCircle, label: "İlan Oluştur", path: "/ilan-ekle" },
    { icon: Clock, label: "Part Time", path: "/part-time" },
    { icon: FileText, label: "CV Oluştur", path: "/cv-olustur" },
    { icon: Headphones, label: "Destek", path: "/destek" },
  ];

  return (
    <>
      {/* Auth prompt bottom sheet */}
      <AnimatePresence>
        {showAuthPrompt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAuthPrompt(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#1E293B] rounded-t-3xl p-6 pb-10 border-t border-white/10 max-w-md mx-auto"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                <button
                  onClick={() => setShowAuthPrompt(false)}
                  className="ml-auto text-muted-foreground hover:text-foreground p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
                  <FileText className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-lg font-bold mb-2">CV Oluşturmak için Giriş Yapın</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Profesyonel CV oluşturmak için hesabınıza giriş yapmanız veya ücretsiz kayıt olmanız gerekmektedir.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/giris"
                  onClick={() => setShowAuthPrompt(false)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-semibold shadow-lg"
                >
                  <LogIn className="w-4 h-4" />
                  Giriş Yap
                </Link>
                <Link
                  href="/kayit"
                  onClick={() => setShowAuthPrompt(false)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/5 border border-white/10 text-foreground font-semibold hover:bg-white/10 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Ücretsiz Kayıt Ol
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t border-white/10 pb-safe md:hidden">
        <div className="flex items-center justify-around h-[70px] max-w-md mx-auto px-2">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            const isCv = item.path === "/cv-olustur";

            if (isCv && !user) {
              return (
                <button
                  key={item.path}
                  onClick={() => setShowAuthPrompt(true)}
                  className="flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 text-muted-foreground"
                >
                  <div className="relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-300">
                    <item.icon className="w-[22px] h-[22px]" />
                  </div>
                  <span className="text-[11px] font-medium">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 ${
                  isActive ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <div className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-300 ${
                  isActive ? "bg-accent/20 shadow-[0_0_15px_rgba(6,182,212,0.3)]" : ""
                }`}>
                  <item.icon className={`w-[22px] h-[22px] ${isActive ? "animate-pulse" : ""}`} />
                </div>
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
