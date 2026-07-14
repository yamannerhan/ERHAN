import type { ComponentType, LazyExoticComponent } from "react";
import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { usePresenceXp } from "./hooks/use-presence-xp";
import { PageLoader } from "@/components/page-loader";
import { RoutedErrorBoundary } from "@/components/route-error-boundary";
import { useDisplayMode } from "@/contexts/DisplayModeContext";

const Home = lazy(() => import("@/pages/home"));
const ListingDetail = lazy(() => import("@/pages/listing-detail"));
const Chat = lazy(() => import("@/pages/chat"));
const Login = lazy(() => import("@/pages/login"));
const Register = lazy(() => import("@/pages/register"));
const Profile = lazy(() => import("@/pages/profile"));
const AdminDashboard = lazy(() => import("@/pages/admin"));
const ModeratorApp = lazy(() => import("@/moderator/ModeratorApp"));
const AddListing = lazy(() => import("@/pages/add-listing"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Favorites = lazy(() => import("@/pages/favorites"));
const Destek = lazy(() => import("@/pages/destek"));
const CvOlustur = lazy(() => import("@/pages/cv-olustur"));
const PartTime = lazy(() => import("@/pages/part-time"));
const NotFound = lazy(() => import("@/pages/not-found"));

function lazyNamed<T extends ComponentType>(
  factory: () => Promise<Record<string, T>>,
  name: string,
): LazyExoticComponent<T> {
  return lazy(() => factory().then((m) => ({ default: m[name] as T })));
}

const ListingsWithSeo = lazyNamed(() => import("@/pages/seo-pages"), "ListingsWithSeo");
const SeoPathPage = lazyNamed(() => import("@/pages/seo-pages"), "SeoPathPage");
const BlogIndexPage = lazyNamed(() => import("@/pages/seo-pages"), "BlogIndexPage");
const BlogPostPage = lazyNamed(() => import("@/pages/seo-pages"), "BlogPostPage");

function RequireAuth({ component: Component }: { component: ComponentType }) {
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
          <Route path="/moderator/:page" component={ModeratorApp} />
          <Route path="/moderator" component={ModeratorApp} />
          <Route path="/:seoSlug" component={SeoPathPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function AppPresence() {
  const { isLite } = useDisplayMode();
  usePresenceXp(!isLite);
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
