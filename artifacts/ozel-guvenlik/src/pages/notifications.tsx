import React from "react";
import {
  useGetNotifications,
  useMarkAllNotificationsRead,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect, Link } from "wouter";
import { motion } from "framer-motion";
import { Bell, Heart, MessageCircle, Info, Briefcase, Trash2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function getToken() { return localStorage.getItem("auth_token") ?? ""; }

export default function Notifications() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const markRead = useMarkAllNotificationsRead();

  const { data: notificationsData, isLoading } = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey(),
      enabled: !!user,
    }
  });

  const notifications = notificationsData || [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  };

  const handleMarkAllRead = async () => {
    try {
      await markRead.mutateAsync();
      invalidate();
    } catch { toast({ title: "Hata", variant: "destructive" }); }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Tüm bildirimler silinecek. Emin misiniz?")) return;
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      invalidate();
      toast({ title: "Tüm bildirimler silindi" });
    } catch { toast({ title: "Hata", variant: "destructive" }); }
  };

  if (isAuthLoading) return null;
  if (!user) return <Redirect to="/giris" />;

  const getIcon = (type: string) => {
    switch (type) {
      case "like":    return <Heart className="w-5 h-5 text-red-500 fill-red-500" />;
      case "reply":   return <MessageCircle className="w-5 h-5 text-accent" />;
      case "listing": return <Briefcase className="w-5 h-5 text-primary" />;
      default:        return <Info className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <Layout>
      <div className="p-4 pb-28 space-y-4">
        {/* Başlık + aksiyonlar */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Bildirimler
            {unreadCount > 0 && (
              <span className="text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">
                {unreadCount} yeni
              </span>
            )}
          </h1>
        </div>

        {notifications.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || markRead.isPending}
              className="flex-1 border-white/10 text-xs gap-1.5 bg-white/5 hover:bg-white/10"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tümünü Okundu İşaretle
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAll}
              className="border-red-500/30 text-red-400 text-xs gap-1.5 bg-red-500/5 hover:bg-red-500/15"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Tümünü Sil
            </Button>
          </div>
        )}

        {/* Liste */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-10">Yükleniyor...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl">
              <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Henüz bildiriminiz yok</p>
            </div>
          ) : (
            notifications.map((notif, i) => (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                key={notif.id}
                className={`glass-card rounded-2xl p-4 flex items-start gap-3 ${!notif.isRead ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
              >
                <div className="mt-0.5 bg-white/5 p-2 rounded-full shrink-0">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/90 leading-snug">{notif.message}</p>
                  <div className="mt-1.5 flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {new Date(notif.createdAt).toLocaleDateString("tr-TR", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                    {notif.linkUrl && (
                      <Link href={notif.linkUrl} className="text-xs text-accent font-semibold hover:underline">
                        Görüntüle
                      </Link>
                    )}
                  </div>
                </div>
                {!notif.isRead && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
