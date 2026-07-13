import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { usePresenceXp } from "./hooks/use-presence-xp";
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
  ListingsWithSeo, SeoPathPage,
  BlogIndexPage, BlogPostPage,
} from "@/pages/seo-pages";
import { RoutedErrorBoundary } from "@/components/route-error-boundary";

function RequireAuth({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/kayit" />;
  return <Component />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
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
        {/* /ankara /istanbul /securitas-is-ilanlari /silahli-guvenlik-is-ilanlari */}
        <Route path="/:seoSlug" component={SeoPathPage} />
        <Route component={NotFound} />
      </Switch>
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