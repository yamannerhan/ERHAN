import React, { Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { usePresenceXp } from "./hooks/use-presence-xp";
import { PageLoader } from "@/components/page-loader";
import { RoutedErrorBoundary } from "@/components/route-error-boundary";

import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import NotFound from "@/pages/not-found";
import ListingDetail from "@/pages/listing-detail";
import PartTime from "@/pages/part-time";
import Favorites from "@/pages/favorites";
import Notifications from "@/pages/notifications";
import Destek from "@/pages/destek";

function lazyPage(factory: () => Promise<{ default: React.ComponentType }>) {
  const Lazy = React.lazy(factory);
  return function LazyRoute() {
    return (
      <Suspense fallback={<PageLoader />}>
        <Lazy />
      </Suspense>
    );
  };
}

const ListingsWithSeo = lazyPage(() => import("@/pages/seo-pages").then(m => ({ default: m.ListingsWithSeo })));
const SeoPathPage = lazyPage(() => import("@/pages/seo-pages").then(m => ({ default: m.SeoPathPage })));
const BlogIndexPage = lazyPage(() => import("@/pages/seo-pages").then(m => ({ default: m.BlogIndexPage })));
const BlogPostPage = lazyPage(() => import("@/pages/seo-pages").then(m => ({ default: m.BlogPostPage })));
const Chat = lazyPage(() => import("@/pages/chat"));
const Profile = lazyPage(() => import("@/pages/profile"));
const AddListing = lazyPage(() => import("@/pages/add-listing"));
const CvOlustur = lazyPage(() => import("@/pages/cv-olustur"));
const AdminDashboard = lazyPage(() => import("@/pages/admin"));
const ModeratorDashboard = lazyPage(() => import("@/pages/moderator"));

function RequireAuth({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/kayit" />;
  return <Component />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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
          <Route path="/:seoSlug" component={SeoPathPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function AppPresence() {
  usePresenceXp(true);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <AppPresence />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  );
}

export default App;
