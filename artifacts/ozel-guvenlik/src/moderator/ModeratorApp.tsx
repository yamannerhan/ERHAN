import React from "react";
import { Route, Switch, Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoader } from "@/components/page-loader";
import { ModeratorProvider } from "./context";
import { ModeratorLayout } from "./ModeratorLayout";
import Dashboard from "./pages/Dashboard";
import Listings from "./pages/Listings";
import Companies from "./pages/Companies";
import Users from "./pages/Users";
import Messages from "./pages/Messages";
import Notifications from "./pages/Notifications";
import Reports from "./pages/Reports";
import IpDevices from "./pages/IpDevices";
import Blacklist from "./pages/Blacklist";
import WordFilter from "./pages/WordFilter";
import Logs from "./pages/Logs";
import Announcements from "./pages/Announcements";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import Forbidden from "./pages/Forbidden";

function ModeratorRoutes() {
  return (
    <Switch>
      <Route path="/moderator">{() => <Redirect to="/moderator/dashboard" />}</Route>
      <Route path="/moderator/dashboard" component={Dashboard} />
      <Route path="/moderator/listings" component={Listings} />
      <Route path="/moderator/companies" component={Companies} />
      <Route path="/moderator/users" component={Users} />
      <Route path="/moderator/messages" component={Messages} />
      <Route path="/moderator/notifications" component={Notifications} />
      <Route path="/moderator/reports" component={Reports} />
      <Route path="/moderator/ip-devices" component={IpDevices} />
      <Route path="/moderator/blacklist" component={Blacklist} />
      <Route path="/moderator/word-filter" component={WordFilter} />
      <Route path="/moderator/logs" component={Logs} />
      <Route path="/moderator/announcements" component={Announcements} />
      <Route path="/moderator/statistics" component={Statistics} />
      <Route path="/moderator/settings" component={Settings} />
      <Route path="/moderator/comments">{() => <Redirect to="/moderator/dashboard" />}</Route>
      <Route>{() => <Redirect to="/moderator/dashboard" />}</Route>
    </Switch>
  );
}

export default function ModeratorApp() {
  const { user, isLoading, canAccessModeratorPanel } = useAuth();

  if (isLoading) return <PageLoader />;

  if (!user) {
    return <Redirect to="/giris?next=/moderator/dashboard" />;
  }

  if (!canAccessModeratorPanel) {
    return <Forbidden />;
  }

  return (
    <ModeratorProvider>
      <ModeratorLayout>
        <ModeratorRoutes />
      </ModeratorLayout>
    </ModeratorProvider>
  );
}
