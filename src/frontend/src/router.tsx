import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import Layout from "@/components/Layout";
import AdminPage from "@/pages/admin/AdminPage";
import DocumentationPage from "@/pages/documentation/DocumentationPage";
import FairValuePage from "@/pages/fair-value/FairValuePage";
import GldtPage from "@/pages/gldt/GldtPage";
import HomePage from "@/pages/home/HomePage";
import NewsPage from "@/pages/news/NewsPage";
import ProposalsPage from "@/pages/proposals/ProposalsPage";
import RewardsPage from "@/pages/rewards/RewardsPage";
import TreasuryPage from "@/pages/treasury/TreasuryPage";

const rootRoute = createRootRoute({
  component: Layout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const treasuryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/treasury",
  component: TreasuryPage,
});

const proposalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proposals",
  component: ProposalsPage,
});

const rewardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rewards",
  component: RewardsPage,
});

const documentationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documentation",
  component: DocumentationPage,
});

const fairValueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fair-value",
  component: FairValuePage,
});

const newsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/news",
  component: NewsPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

// Not added to the nav on purpose — reachable only by typing /gldt.
const gldtRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gldt",
  component: GldtPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  treasuryRoute,
  proposalsRoute,
  rewardsRoute,
  fairValueRoute,
  documentationRoute,
  newsRoute,
  adminRoute,
  gldtRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
