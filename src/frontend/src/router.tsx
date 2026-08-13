import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import Layout from "@/components/Layout";
import DocumentationPage from "@/pages/documentation/DocumentationPage";
import HomePage from "@/pages/home/HomePage";
import NewsPage from "@/pages/news/NewsPage";
import ProposalsPage from "@/pages/proposals/ProposalsPage";
import RewardsPage from "@/pages/rewards/RewardsPage";
import TreasuryPage from "@/pages/treasury/TreasuryPage";
import FairValuePage from "@/pages/fair-value/FairValuePage";

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

const routeTree = rootRoute.addChildren([
  homeRoute,
  treasuryRoute,
  proposalsRoute,
  rewardsRoute,
  fairValueRoute,
  documentationRoute,
  newsRoute,
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
