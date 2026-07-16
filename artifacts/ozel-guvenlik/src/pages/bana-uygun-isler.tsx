import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { JobListingCard, type JobCardListing } from "@/components/job-listing-card";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Settings2 } from "lucide-react";
import "./bana-uygun-isler.css";

type MatchListing = JobCardListing & {
  matchScore?: number;
  matchLabel?: string;
  matchLabelText?: string;
  matchReasons?: string[];
  matchMismatches?: string[];
  isAlternative?: boolean;
};

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

function scoreClass(label?: string) {
  if (label === "cok_uygun") return "og-match-badge--great";
  if (label === "uygun") return "og-match-badge--good";
  if (label === "ilgini_cekebilir") return "og-match-badge--ok";
  return "og-match-badge--normal";
}

export default function BanaUygunIslerPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [listings, setListings] = useState<MatchListing[]>([]);
  const [alternatives, setAlternatives] = useState<MatchListing[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/job-match/listings?limit=24", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json() as {
        completed?: boolean;
        listings?: MatchListing[];
        alternatives?: MatchListing[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || "Yüklenemedi");
        return;
      }
      setCompleted(!!json.completed);
      setListings(json.listings ?? []);
      setAlternatives(json.alternatives ?? []);
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (!user) {
    return (
      <Layout>
        <div className="og-match-page">
          <h1>Sana Uygun İşler</h1>
          <p className="og-match-lead">Giriş yaparak tercihlerine göre ilanları görebilirsin.</p>
          <Link href="/giris"><Button className="og-match-cta">Giriş Yap</Button></Link>
        </div>
      </Layout>
    );
  }

  if (!loading && !completed) {
    return (
      <Layout>
        <div className="og-match-page og-match-empty">
          <Sparkles className="og-match-empty-icon" />
          <h1>Sana Uygun İşler</h1>
          <p className="og-match-lead">
            Sana uygun ilanları bulabilmemiz için önce çalışma tercihlerini belirtmelisin.
          </p>
          <Button className="og-match-cta" onClick={() => navigate("/bana-uygun-isler/ayarlar")}>
            Tercihlerimi Doldur
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="og-match-page">
        <div className="og-match-head">
          <div>
            <h1>Sana Uygun İşler</h1>
            <p className="og-match-lead">Profilindeki çalışma tercihlerine göre sıralandı.</p>
          </div>
          <button type="button" className="og-match-edit" onClick={() => navigate("/bana-uygun-isler/ayarlar")}>
            <Settings2 className="w-4 h-4" /> Tercihlerimi Güncelle
          </button>
        </div>

        {loading && (
          <div className="og-match-loading"><Loader2 className="w-6 h-6 animate-spin" /> Eşleştiriliyor…</div>
        )}
        {error && <p className="og-match-error">{error}</p>}

        {!loading && listings.length > 0 && (
          <div className="og-match-grid">
            {listings.map((l) => (
              <div key={l.id} className="og-match-card-wrap">
                <div className={`og-match-badge ${scoreClass(l.matchLabel)}`}>
                  %{l.matchScore ?? 0} {l.matchLabelText || "Uyumlu"}
                </div>
                {!!l.matchReasons?.length && (
                  <div className="og-match-reasons">
                    {l.matchReasons.slice(0, 4).map((r) => (
                      <span key={r} className="og-match-chip">{r}</span>
                    ))}
                  </div>
                )}
                <JobListingCard listing={l} />
              </div>
            ))}
          </div>
        )}

        {!loading && listings.length === 0 && alternatives.length > 0 && (
          <section className="og-match-alt">
            <h2>Tercihlerine çok yakın ilanlar</h2>
            <p className="og-match-lead">Bazı kriterler tam uymasa da sana yakın seçenekler:</p>
            <div className="og-match-grid">
              {alternatives.map((l) => (
                <div key={l.id} className="og-match-card-wrap">
                  <div className={`og-match-badge ${scoreClass(l.matchLabel)}`}>
                    %{l.matchScore ?? 0} {l.matchLabelText || "Öneri"}
                  </div>
                  {!!l.matchMismatches?.length && (
                    <div className="og-match-reasons og-match-reasons--warn">
                      {l.matchMismatches.map((r) => (
                        <span key={r} className="og-match-chip og-match-chip--warn">{r}</span>
                      ))}
                    </div>
                  )}
                  <JobListingCard listing={l} />
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && listings.length === 0 && alternatives.length === 0 && (
          <div className="og-match-empty">
            <p>Şu an tam eşleşen ilan yok. Tercihlerini genişletmeyi dene.</p>
            <Button variant="outline" onClick={() => navigate("/bana-uygun-isler/ayarlar")}>
              Tercihlerimi Güncelle
            </Button>
          </div>
        )}

        {!loading && listings.length > 0 && alternatives.length > 0 && (
          <section className="og-match-alt">
            <h2>Tercihlerine çok yakın ilanlar</h2>
            <div className="og-match-grid">
              {alternatives.slice(0, 8).map((l) => (
                <div key={l.id} className="og-match-card-wrap">
                  <div className={`og-match-badge ${scoreClass(l.matchLabel)}`}>
                    %{l.matchScore ?? 0} yakın
                  </div>
                  {!!l.matchMismatches?.length && (
                    <div className="og-match-reasons og-match-reasons--warn">
                      {l.matchMismatches.slice(0, 2).map((r) => (
                        <span key={r} className="og-match-chip og-match-chip--warn">{r}</span>
                      ))}
                    </div>
                  )}
                  <JobListingCard listing={l} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
