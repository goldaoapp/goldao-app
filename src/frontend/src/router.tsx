import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import Layout from "@/components/Layout";
import DocumentationPage from "@/pages/DocumentationPage";
import HomePage from "@/pages/HomePage";
import NewsPage from "@/pages/NewsPage";
import ProposalsPage from "@/pages/ProposalsPage";
import RewardsPage from "@/pages/RewardsPage";
import TreasuryPage from "@/pages/TreasuryPage";

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
