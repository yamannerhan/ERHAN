import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
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
import {
  ListingsWithSeo, SlugIsIlanlariPage, CitySeoListingsEnhanced, CityShortSeoPage,
  BlogIndexPage, BlogPostPage,
} from "@/pages/seo-pages";

function RequireAuth({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/kayit" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/ilanlar" component={ListingsWithSeo} />
      <Route path="/ilan/:id" component={ListingDetail} />
      <Route path="/blog/:postSlug" component={BlogPostPage} />
      <Route path="/blog" component={BlogIndexPage} />
      <Route path="/sohbet" component={Chat} />
      <Route path="/destek" component={Destek} />
      <Route path="/giris" component={Login} />
      <Route path="/kayit" component={Register} />
      <Route path="/profil/:username" component={Profile} />
      <Route path="/ilan-ekle">{() => <RequireAuth component={AddListing} />}</Route>
      <Route path="/bildirimler" component={Notifications} />
      <Route path="/favoriler" component={Favorites} />
      <Route path="/cv-olustur">{() => <RequireAuth component={CvOlustur} />}</Route>
      <Route path="/part-time" component={PartTime} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/moderator" component={ModeratorDashboard} />
      <Route path="/:slug-is-ilanlari" component={SlugIsIlanlariPage} />
      <Route path="/:slug-ozel-guvenlik-is-ilanlari" component={CitySeoListingsEnhanced} />
      {/* 81 il + ilçe kısa SEO: /ankara /istanbul /gebze */}
      <Route path="/:citySlug" component={CityShortSeoPage} />
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