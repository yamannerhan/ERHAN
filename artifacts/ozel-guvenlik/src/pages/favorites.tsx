import React from "react";
import { useGetMyFavorites, getGetMyFavoritesQueryKey } from "@workspace/api-client-react";
import type { Listing } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect, Link } from "wouter";
import { motion } from "framer-motion";
import { Bookmark, MapPin, Briefcase } from "lucide-react";
import { displayCompany } from "@/lib/utils";

export default function Favorites() {
  const { user, isLoading: isAuthLoading } = useAuth();
  
  const { data: listingsData, isLoading } = useGetMyFavorites({
    query: {
      queryKey: getGetMyFavoritesQueryKey(),
      enabled: !!user
    }
  });

  if (isAuthLoading) return null;
  if (!user) return <Redirect to="/giris" />;

  const listings: Listing[] = listingsData || [];

  return (
    <Layout>
      <div className="p-4 space-y-6">
        <h1 className="text-2xl font-bold flex items-center">
          <Bookmark className="w-6 h-6 mr-2 text-primary fill-primary/20" />
          Favorilerim
        </h1>

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-10">Yükleniyor...</div>
          ) : listings.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl">
              <Bookmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Henüz favoriye eklediğiniz bir ilan yok.</p>
              <Link href="/ilanlar" className="text-accent mt-2 inline-block">İlanlara Göz At</Link>
            </div>
          ) : (
            listings.map((listing, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={listing.id}
                className="glass-card rounded-2xl p-4"
              >
                <Link href={`/ilan/${listing.id}`} className="block">
                  <h3 className="font-semibold text-lg leading-tight mb-1">{listing.title}</h3>
                  {displayCompany(listing.company) && (
                    <p className="text-sm text-muted-foreground mb-3">{displayCompany(listing.company)}</p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center space-x-3">
                      <span className="flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-accent" />
                        {listing.city}
                      </span>
                      <span className="flex items-center">
                        <Briefcase className="w-3.5 h-3.5 mr-1 text-secondary" />
                        {listing.workType}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
