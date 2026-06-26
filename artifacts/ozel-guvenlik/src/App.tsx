import { Switch, Route, Router as WouterRouter, Redirect, useRoute } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Listings from "@/pages/listings";
import ListingDetail from "@/pages/listing-detail";
import Chat from "@/pages/chat";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Profile from "@/pages/profile";
import AdminDashboard from "@/pages/admin";
import ModeratorDashboard from "@/pages/moderator";
import AddListing from "@/pages/add-listing";
import Notifications from "@/pages/notifications";
import Favorites from "@/pages/favorites";
import Destek from "@/pages/destek";
import CvOlustur from "@/pages/cv-olustur";
import PartTime from "@/pages/part-time";
import { slugToCity } from "@/lib/seo-cities";
import { SEO_CITY_CONTENTS } from "@/lib/seo-cities";
import { useDocumentMeta } from "@/hooks/use-document-meta";

const BASE_URL = "https://ozelguvenlik.online";

function RequireAuth({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/kayit" />;
  return <Component />;
}

function CitySeoListings() {
  const [match, params] = useRoute("/:slug-ozel-guvenlik-is-ilanlari");
  const slug = params?.slug ?? "";
  const city = slugToCity(slug);
  const seo = city ? SEO_CITY_CONTENTS[city] : null;
  const pageUrl = `${BASE_URL}/${slug}-ozel-guvenlik-is-ilanlari`;

  useDocumentMeta({
    title: seo?.title ?? "Özel Güvenlik İş İlanları",
    description: seo?.description ?? "Türkiye genelinde özel güvenlik iş ilanları.",
    keywords: seo?.keywords ?? "özel güvenlik iş ilanları, güvenlik görevlisi alımı",
    canonical: pageUrl,
    ogImage: `${BASE_URL}/og-image.jpg`,
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Ana Sayfa", "item": BASE_URL },
        { "@type": "ListItem", "position": 2, "name": "İlanlar", "item": `${BASE_URL}/ilanlar` },
        { "@type": "ListItem", "position": 3, "name": city ?? "Şehir", "item": pageUrl },
      ],
    },
  });

  if (!city) return <NotFound />;
  return <Listings initialCity={city} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/ilanlar" component={Listings} />
      <Route path="/ilan/:id" component={ListingDetail} />
      <Route path="/sohbet" component={Chat} />
      <Route path="/destek" component={Destek} />
      <Route path="/giris" component={Login} />
      <Route path="/kayit" component={Register} />
      <Route path="/profil/:username" component={Profile} />
      <Route path="/ilan-ekle" component={AddListing} />
      <Route path="/bildirimler" component={Notifications} />
      <Route path="/favoriler" component={Favorites} />
      <Route path="/cv-olustur">{() => <RequireAuth component={CvOlustur} />}</Route>
      <Route path="/part-time" component={PartTime} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/moderator" component={ModeratorDashboard} />
      <Route path="/:slug-ozel-guvenlik-is-ilanlari" component={CitySeoListings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  );
}

export default App;