import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function getBasepath() {
  if (typeof window !== "undefined") {
    const match = window.location.pathname.match(/^(\/meowmeow_imposter)(?=\/|$)/);
    if (match) return match[1];
  }
  const base = import.meta.env.BASE_URL || "/";
  if (base === "/") return undefined;
  return base.replace(/\/$/, "");
}

export const getRouter = () => {
  const queryClient = new QueryClient();
  const basepath = getBasepath();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(basepath ? { basepath } : {}),
    defaultPendingComponent: () => (
      <div className="flex min-h-screen items-center justify-center bg-[#f5eef4] font-[Nunito]">
        <p className="text-lg font-extrabold tracking-wide text-[#5b5265]">MeowMeow Imposter</p>
      </div>
    ),
  });

  return router;
};
